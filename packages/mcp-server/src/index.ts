#!/usr/bin/env node
import { Bridge } from './bridge';
import { runDaemon, runShim } from './daemon';
import { error, setLogSink } from './logger';
import { clearPlatformState, refreshPlatformState } from './platform-state';
import { syncToolAvailability } from './server';

const bridge = new Bridge();

// 插件上线/掉线 → 通知所有会话(工具目录保持稳定,可用性由运行时兜底),
// 并在上线时自动探测一次平台状态缓存(断开即清空,避免拿旧平台判断新连接)
bridge.onConnectionChange = (connected) => {
  syncToolAvailability(connected);
  if (connected) {
    void refreshPlatformState(bridge);
    return;
  }
  clearPlatformState('插件断开');
};

// 日志触发 → 实时推送插件 UI。daemon 持有 WS:在线直推,离线进环形缓冲待上线回放;
// shim 无 WS 通道,只攒缓冲不回放(其日志靠 TEXT_TO_DESIGN_MCP_LOG 文件排查)
setLogSink((level, line) => bridge.notifyLog(level, line));

const IS_DAEMON =
  process.env.TEXT_TO_DESIGN_MCP_ROLE === 'daemon' ||
  process.argv.includes('daemon');

if (IS_DAEMON) {
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
