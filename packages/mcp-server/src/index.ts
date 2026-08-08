#!/usr/bin/env node
import { Bridge } from './bridge';
import { runDaemon, runShim } from './daemon';

const bridge = new Bridge();

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
