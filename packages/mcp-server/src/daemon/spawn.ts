import { spawn } from 'node:child_process';
import { error } from '../logger';

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
    error(`拉起 daemon 失败: ${e.message}`);
  });
}
