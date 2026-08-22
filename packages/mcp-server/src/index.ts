#!/usr/bin/env node
import { Bridge } from './bridge';
import { runDaemon, runShim } from './daemon';
import { syncToolAvailability } from './server';

const bridge = new Bridge();

// 插件上线/掉线 → 同步所有会话的工具可用性(离线时除 ping 外隐藏)
bridge.onConnectionChange = syncToolAvailability;

const IS_DAEMON =
  process.env.TEXT_TO_DESIGN_MCP_ROLE === 'daemon' ||
  process.argv.includes('daemon');

if (IS_DAEMON) {
  runDaemon(bridge).catch((e) => {
    bridge.stop();
    process.stderr.write(
      `[text-to-design-mcp] daemon 启动失败: ${e instanceof Error ? e.message : String(e)}\n`,
    );
    process.exit(1);
  });
} else {
  runShim().catch((e) => {
    process.stderr.write(
      `[text-to-design-mcp] shim 启动失败: ${e instanceof Error ? e.message : String(e)}\n`,
    );
    process.exit(1);
  });
}
