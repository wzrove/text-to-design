import {
  McpServer,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/server';
import type { Bridge } from './bridge';
import { SERVER_NAME, SERVER_VERSION } from './config';
import type { McpI18n } from './i18n';
import { createMcpI18n } from './i18n';
import { log } from './logger';
import { toolRegistrars } from './tools';

/** 存活中的 MCP 会话(daemon 常驻,多个 AI 会话共享同一 Bridge) */
const liveSessions = new Set<McpServer>();

/**
 * 插件连接变化时同步所有会话。
 *
 * 工具目录保持稳定:不再按连接状态 enable/disable。原因是隐藏式门控依赖客户端
 * 收到 listChanged 后主动重拉目录,而多数 MCP 客户端不处理该通知——会话若在插件
 * 离线时建立,工具表会被永久卡在 1 个(仅 jsd_ping)。可用性下沉到运行时:
 * Bridge.request 在离线时快速失败并返回明确提示,调用层同样拿到可读报错。
 */
export function syncToolAvailability(connected: boolean): void {
  for (const server of liveSessions) {
    try {
      server.sendToolListChanged();
    } catch {
      // 会话已死,等 onclose 自行清理
    }
  }
  log(
    `连接状态变化: ${connected ? '插件上线' : '插件离线'}(工具目录保持不变,会话数 ${liveSessions.size})`,
  );
}

/**
 * 装配 McpServer:注册全部工具(工具实现分散在 tools/*,此处只做编排)。
 *
 * `i18n` 是**装配期**产物:工具面文案在注册时投影一次,之后不再变(不做运行期热切换,
 * 见 0016 候选表 —— 重跑 registerTool 会打乱宿主索引)。locale 只在这里解析一次
 * (`TEXT_TO_DESIGN_LANG` → 默认 `zh-CN`),显式传给每个 registrar(沿 0002:不设单例)。
 */
export function buildServer(
  bridge: Bridge,
  i18n: McpI18n = createMcpI18n(),
): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      supportedProtocolVersions: ['2026-07-28', ...SUPPORTED_PROTOCOL_VERSIONS],
      // INSTRUCTIONS 源码里存 MessageKey(0016):它是模型读的纪律文案,
      // 与工具描述同一套翻译,不另起一份
      instructions: i18n.t('mcp.instructions'),
    },
  );
  for (const register of toolRegistrars) {
    register(server, bridge, i18n);
  }

  liveSessions.add(server);

  // 会话结束时从存活表摘除(链式保留 SDK 原有 onclose)
  const inner = server.server as unknown as { onclose?: () => void };
  const prevOnClose = inner.onclose;
  inner.onclose = () => {
    liveSessions.delete(server);
    prevOnClose?.();
  };

  return server;
}
