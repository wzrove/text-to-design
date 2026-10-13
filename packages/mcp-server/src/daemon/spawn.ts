import { spawn } from 'node:child_process';
import { error } from '../logger';

/**
 * detached 拉起 daemon(独立常驻,不受本会话生命周期影响)
 *
 * `argvOverride` 给「入口带子命令」的场景用:默认沿用本进程的整个 argv(保持
 * shim / dev 态的入口不变),但 `exec` 这类子命令**不能**被带过去 —— 否则被拉起的
 * daemon 会再按 exec 跑一遍,变成递归。
 */
export function spawnDaemon(argvOverride?: readonly string[]): void {
  const child = spawn(
    process.execPath,
    [...process.execArgv, ...(argvOverride ?? process.argv.slice(1))],
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
