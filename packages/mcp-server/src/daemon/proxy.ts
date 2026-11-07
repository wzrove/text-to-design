import type { Client } from '@modelcontextprotocol/client';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { SERVER_VERSION } from '../config';
import { log, warn } from '../logger';
import { createCatalogProxy } from './catalog-proxy';
import { delay, fetchDaemonHealth, probeUpstream } from './probe';
import type { UpstreamCall } from './proxy-protocol';
import { spawnDaemon } from './spawn';

export { promptArgsSchema } from './catalog-proxy';

const RECONNECT_DELAY_MS = 1500;
/** 重连总预算:超时后放弃本次恢复,把错误交还客户端 */
const RECONNECT_BUDGET_MS = 20000;

/**
 * 目录新鲜度节奏。**不再是「快速档 / 慢速档」** —— 那个设计的前提已经不成立。
 *
 * 原设计假设「插件上下线会改变上游工具目录」,所以启动/重连后 20s 内按 2s 轮询
 * 抢在目录变化时尽快收敛。但 daemon 早已把目录与连接状态解耦(见 server.ts
 * syncToolAvailability:工具目录保持稳定,可用性下沉到运行时判定),而
 * toolRegistrars 本身是固定清单、平台门控发生在调用时(core/registry.ts)——
 * 也就是说**同一 daemon 版本下目录根本不会变**,2s 轮询每轮都在重拉一份完全
 * 相同的清单然后 diff 出「无变化」。
 *
 * 代价还不止请求数:listTools 单次回包 ~1.27 MB(53 个工具,其中 80% 是各工具
 * 重复的 outputSchema),于是快速档 ≈ 38 MB/分钟、稳态 ≈ 5 MB/分钟,每个会话
 * 各一份。
 *
 * 现在的策略:
 * - 常态只做一次廉价的 `/health` 版本自检(1 个 GET,几百字节);
 * - 只有「上游被换成了别的版本」才全量 resync;
 * - 另留一条极慢的全量兜底,防将来出现条件注册(目录真会变时有个保险)。
 */
const HEALTH_POLL_MS = 60_000;
const FULL_RESYNC_MS = 600_000;

/** stateless HTTP 无常驻连接,上游死亡只会表现为「下一次请求失败」;
 *  onclose 不可依赖,必须同时识别这类传输层错误 */
function isTransportError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /fetch failed|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|terminated|closed/i.test(
    msg,
  );
}

/**
 * shim 模式:stdio 与 daemon 之间的 MCP 代理(McpServer 动态重注册)。
 *
 * 本地注册表只承担「目录」职责,工具调用始终实时转发 daemon;目录新鲜度由三重
 * 机制保证(按可靠性排序):
 * ① 下游握手时全量同步;
 * ② 上游重连成功后补偿同步(断连期间错过的变更);
 * ③ 常态只做 `/health` 版本自检,版本变化才全量 resync;另有一条极慢的全量兜底。
 *
 * 注意 ③ 不再是「定时重拉清单」:上游目录在同一 daemon 版本下是静态的
 * (固定注册清单 + 调用时平台门控),定时重拉只会反复取回同一份 1.27 MB 的清单。
 * 历史实现的 2s/15s 轮询在快速档下每分钟拉 38 MB,纯属浪费 —— 见下方节奏常量注释。
 * registerTool/remove 自带下游 listChanged 广播,规范客户端会自动刷新。
 */
export async function serveProxy(initialClient: Client): Promise<void> {
  let upstream: Client = initialClient;
  let shuttingDown = false;
  let reconnectPromise: Promise<void> | null = null;

  /** 统一出口:传输层错误 → 触发重连并重放一次;恢复后仍失败才交给下游 */
  const withUpstream: UpstreamCall = async (fn, options) => {
    try {
      return await fn(upstream);
    } catch (e) {
      if (shuttingDown || !isTransportError(e)) throw e;
      warn(
        options?.replay === false
          ? 'shim: 上游请求失败,恢复连接但不重放写操作'
          : 'shim: 上游请求失败,触发重连后重放',
      );
      await ensureReconnect();
      if (options?.replay === false) throw e;
      return fn(upstream);
    }
  };

  const {
    server: mcp,
    syncAll: resyncAll,
    wireNotifications,
  } = createCatalogProxy(initialClient, withUpstream);

  const ensureReconnect = (): Promise<void> => {
    if (reconnectPromise) return reconnectPromise;
    reconnectPromise = (async () => {
      const deadline = Date.now() + RECONNECT_BUDGET_MS;
      let lastError: unknown = null;
      while (Date.now() < deadline) {
        try {
          const p = await probeUpstream();
          if (p.state === 'proxy') {
            const previous = upstream;
            upstream = p.client;
            previous.onclose = undefined;
            await previous.close().catch(() => {});
            await wireUpstream(upstream);
            log('shim: 上游已恢复');
            // 同步可能正在等待本次重连，不能反向等待同步队列(dec 9c4b0406)。
            void resyncAll().catch((error) => warn(String(error)));
            return;
          }
          // daemon 不在了(被杀/未起) → 按版本自检逻辑重新拉起;
          // starting(在跑但未就绪) 只需等待,无需重复拉起
          if (p.state === 'none') spawnDaemon();
        } catch (e) {
          lastError = e; /* 单轮失败,下轮重试 */
        }
        await delay(RECONNECT_DELAY_MS);
      }
      throw lastError ?? new Error(`上游重连超时(${RECONNECT_BUDGET_MS}ms)`);
    })().finally(() => {
      reconnectPromise = null;
    });
    return reconnectPromise;
  };

  const wireUpstream = async (client: Client): Promise<void> => {
    client.onclose = () => {
      if (shuttingDown || client !== upstream) return;
      warn('shim: 上游断开,自动重连');
      void ensureReconnect().catch((error) => warn(String(error)));
    };
    wireNotifications(client);
    if (client.getProtocolEra() !== 'modern') return;
    const capabilities = client.getServerCapabilities();
    const filter = {
      toolsListChanged: capabilities?.tools?.listChanged === true,
      promptsListChanged: capabilities?.prompts?.listChanged === true,
      resourcesListChanged: capabilities?.resources?.listChanged === true,
    };
    if (!Object.values(filter).some(Boolean)) return;
    try {
      const subscription = await client.listen(filter);
      void subscription.closed
        .then(async (reason) => {
          if (reason === 'local' || shuttingDown || client !== upstream) return;
          await delay(RECONNECT_DELAY_MS);
          if (!shuttingDown && client === upstream) await ensureReconnect();
        })
        .catch((error) => warn(String(error)));
    } catch (error) {
      warn(`shim: 目录变更订阅失败,由定期同步兜底: ${String(error)}`);
    }
  };

  await wireUpstream(upstream);

  const stdioHandle = serveStdio(async () => {
    await resyncAll(); // 下游握手前先对齐一次清单(尽力而为,失败留待兜底轮询补偿)
    return mcp;
  });

  // ---- 新鲜度:廉价版本自检 + 极慢全量兜底 ----
  //
  // 目录在同一 daemon 版本下是静态的,所以常态不重拉清单,只问一次 /health:
  // 版本没变就什么都不做。上游被换成别的版本时(多来源安装、手动重启)才全量 resync。
  // 另一个入口是 withUpstream 的传输层错误路径 —— 上游断连会走 ensureReconnect,
  // 成功后本来就会 resyncAll,那条路不依赖这里的轮询。
  let syncedVersion: string | null = SERVER_VERSION;
  let healthTimer: NodeJS.Timeout | null = null;
  let fullTimer: NodeJS.Timeout | null = null;

  const pollHealth = async (): Promise<void> => {
    const health = await fetchDaemonHealth();
    // 探不到(daemon 不在)什么都不做:真需要目录时 withUpstream 会失败并触发重连
    if (health == null) return;
    if (health.version === syncedVersion) return;
    log(`上游版本变化(${syncedVersion} → ${health.version}),全量重同步目录`);
    syncedVersion = health.version;
    await resyncAll();
  };

  const scheduleHealth = (): void => {
    if (shuttingDown) return;
    healthTimer = setTimeout(() => {
      if (shuttingDown) return;
      void pollHealth().finally(scheduleHealth);
    }, HEALTH_POLL_MS);
    healthTimer.unref();
  };

  const scheduleFullResync = (): void => {
    if (shuttingDown) return;
    fullTimer = setTimeout(() => {
      if (shuttingDown) return;
      void resyncAll().finally(scheduleFullResync);
    }, FULL_RESYNC_MS);
    fullTimer.unref();
  };

  scheduleHealth();
  scheduleFullResync();
  log('shim 模式: stdio → 动态同步,共享 daemon');
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (healthTimer) clearTimeout(healthTimer);
    if (fullTimer) clearTimeout(fullTimer);
    await stdioHandle.close().catch((e) => {
      warn(
        `关闭 stdio 失败(忽略): ${e instanceof Error ? e.message : String(e)}`,
      );
    });
    await upstream.close().catch(() => {});
  };
  process.stdin.once('end', () => {
    void shutdown();
  });
  process.stdin.once('close', () => {
    void shutdown();
  });
  process.on('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });
}
