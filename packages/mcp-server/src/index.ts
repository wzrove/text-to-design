#!/usr/bin/env node
import { Bridge } from './bridge';
import type { ServiceOptions } from './daemon';
import { installService, runDaemon, runShim, uninstallService } from './daemon';
import { runExecCli } from './daemon/exec';
import { error, log, setLogSink } from './logger';
import { clearPlatformState, refreshPlatformState } from './platform-state';
import { captureError } from './telemetry';

const bridge = new Bridge();

// 插件上线/掉线 → 刷新/清空平台状态缓存,并留一行日志。
// 工具目录**不跟着动**(可用性下沉到运行时:离线时 Bridge.request 快速失败),
// 所以这里不发 list_changed —— 目录在同一 daemon 版本下恒定,那条广播从没有过内容(0030)。
bridge.onConnectionChange = (connected) => {
  log(`连接状态变化: ${connected ? '插件上线' : '插件离线'}(工具目录不变)`);
  if (connected) {
    void refreshPlatformState(bridge);
    return;
  }
  clearPlatformState('插件断开');
};

// 日志触发 → 实时推送插件 UI。daemon 持有 WS:在线直推,离线进环形缓冲待上线回放;
// shim 无 WS 通道,只攒缓冲不回放(其日志靠 TEXT_TO_DESIGN_MCP_LOG 文件排查)。
// error 级同时采进遥测:logger 是 daemon 全部错误的汇聚点(见 telemetry.ts)
setLogSink((record) => {
  if (record.level === 'error') captureError(record);
  bridge.notifyLog(record);
});

const IS_DAEMON =
  process.env.TEXT_TO_DESIGN_MCP_ROLE === 'daemon' ||
  process.argv.includes('daemon');

/**
 * 子命令分发。
 *
 * - 无参数     → shim(MCP 宿主按 stdio 拉起,转发给 daemon,必要时 spawn)
 * - `daemon`   → 常驻 daemon(幂等:已有实例则直接退出)
 * - `exec <calls.json>` → 从文件跑一次 jsd_batch(参数体太大时不必把它搬进上下文)
 * - `install-service` / `uninstall-service` → 用户级自启注册,让 daemon 与
 *   MCP 会话解耦(面板不必等 AI 会话起来才能连上)
 */
const ARGV = process.argv.slice(2);
const SERVICE_CMD = ARGV.find(
  (a) => a === 'install-service' || a === 'uninstall-service',
);
/** `exec` 只在「以 CLI 身份被调用」时成立:被 spawn 出来的 daemon 也带着同一个 argv */
const EXEC_CMD = ARGV[0] === 'exec' && !IS_DAEMON;

if (SERVICE_CMD) {
  // CLI 子命令的前台可见性:默认日志只落盘,终端用户会看见「什么都没发生」。
  // 复用既有 sink 机制把同一批日志外发到终端(logger 保持零本地依赖)
  setLogSink((record) => {
    const stream =
      record.level === 'error' || record.level === 'warn'
        ? process.stderr
        : process.stdout;
    stream.write(`[text-to-design-mcp] ${record.message}\n`);
  });
  const opts: ServiceOptions = {
    dryRun: ARGV.includes('--dry-run'),
    force: ARGV.includes('--force'),
  };
  if (SERVICE_CMD === 'install-service') installService(opts);
  else uninstallService(opts);
} else if (EXEC_CMD) {
  // exec 的 stdout 是**数据通道**(--json 时给管道消费),所以日志一律走 stderr ——
  // 否则一行 log 就把 JSON 流弄脏了
  setLogSink((record) => {
    process.stderr.write(`[text-to-design-mcp] ${record.message}\n`);
  });
  void runExecCli(ARGV.slice(1));
} else if (IS_DAEMON) {
  runDaemon(bridge).catch((e) => {
    bridge.stop();
    error(`daemon 启动失败: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
} else {
  runShim().catch((e) => {
    error(`shim 启动失败: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
