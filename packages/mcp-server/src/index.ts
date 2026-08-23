#!/usr/bin/env node
import { Bridge } from './bridge';
import { runDaemon, runShim } from './daemon';
import { error, setLogSink } from './logger';
import { syncToolAvailability } from './server';

const bridge = new Bridge();

// 插件上线/掉线 → 同步所有会话的工具可用性(离线时除 ping 外隐藏)
bridge.onConnectionChange = syncToolAvailability;

// 日志触发 → 实时推送插件 UI(daemon 持有 WS;shim 下 isConnected 恒 false 天然 no-op)
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
