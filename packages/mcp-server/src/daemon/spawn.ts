import { spawn } from 'node:child_process';

/** detached 拉起 daemon(独立常驻,不受本会话生命周期影响) */
export function spawnDaemon(): void {
  const child = spawn(
    process.execPath,
    [...process.execArgv, ...process.argv.slice(1)],
    {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, TEXT_TO_DESIGN_MCP_ROLE: 'daemon' },
    },
  );
  child.unref();
  child.on('error', (e) => {
    process.stderr.write(
      `[text-to-design-mcp] 拉起 daemon 失败: ${e.message}\n`,
    );
  });
}
