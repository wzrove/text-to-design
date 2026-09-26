import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { HTTP_PORT, PORT, SERVER_NAME, SERVER_VERSION } from '../config';
import { error, log, warn } from '../logger';

/**
 * 用户级自启注册(install-service / uninstall-service)。
 *
 * 动机:daemon 是插件 WS(47812)的唯一宿主,但历史上它只能由 MCP 宿主拉起
 * stdio shim 时顺带 spawn —— 于是「没开 AI 会话」时插件面板永远连不上。
 * 把 daemon 交给操作系统自启,daemon 生命周期就与 MCP 会话解耦。
 *
 * 刻意只做**用户级**:注册系统级服务要 root / 管理员权限,而本服务只需要
 * 监听本机端口、读写用户目录。
 */

export interface ServiceOptions {
  /** 只打印计划,不落盘、不执行系统命令 */
  dryRun?: boolean;
  /** 绕过 npx/开发态路径检查,强行用当前路径注册 */
  force?: boolean;
}

type PlanStep =
  | { kind: 'write'; path: string; content: string }
  | { kind: 'rm'; path: string }
  | { kind: 'run'; cmd: string; args: string[] }
  | { kind: 'note'; line: string };

const UNIT_NAME = 'text-to-design-mcp';

/** 服务定义里的路径必须带引号才能容纳空格 */
function q(path: string): string {
  return path.includes(' ') ? `"${path}"` : path;
}

/** plist 是 XML:路径里的 & < > 必须转义,否则 launchd 解析失败 */
function xml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 解析可复用的启动命令。
 *
 * 只有「稳定落盘」的入口才配写进服务定义:
 * - npx 缓存(~/.npm/_npx/<hash>/)随时会被清理 → 注册后必失效
 * - 开发态(tsx src/index.ts)是 .ts,服务直接 node 跑不起来
 */
function resolveEntry(): { exe: string; script: string } | { problem: string } {
  const script = resolve(process.argv[1] ?? '');
  const exe = process.execPath;
  if (!script) return { problem: '无法定位入口脚本(process.argv[1] 为空)' };
  if (script.endsWith('.ts')) {
    return {
      problem:
        '当前是开发态(tsx 直接跑 TS 源码),不能注册自启。请改用构建产物(pnpm build 后 node dist/index.js install-service)或全局安装的 text-to-design-mcp',
    };
  }
  if (script.split(sep).includes('_npx')) {
    return {
      problem: `入口位于 npx 缓存目录(${script}),该目录会被 npm 清理,注册后必然失效。请先 npm i -g text-to-design-mcp,再用全局命令重跑 install-service`,
    };
  }
  return { exe, script };
}

function linuxPlan(exe: string, script: string): PlanStep[] {
  const unitPath = join(
    homedir(),
    '.config/systemd/user',
    `${UNIT_NAME}.service`,
  );
  const unit = `[Unit]
Description=${SERVER_NAME} (design plugin bridge: WS ${PORT} / MCP HTTP ${HTTP_PORT})
Documentation=https://github.com/wzrove/text-to-design
After=network.target

[Service]
Type=simple
Environment=TEXT_TO_DESIGN_MCP_ROLE=daemon
ExecStart=${q(exe)} ${q(script)} daemon
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
`;
  return [
    { kind: 'write', path: unitPath, content: unit },
    { kind: 'run', cmd: 'systemctl', args: ['--user', 'daemon-reload'] },
    {
      kind: 'run',
      cmd: 'systemctl',
      args: ['--user', 'enable', '--now', `${UNIT_NAME}.service`],
    },
    {
      kind: 'note',
      line: `注销后仍要保持常驻:loginctl enable-linger ${process.env.USER ?? '$USER'}(否则只在登录会话内运行)`,
    },
  ];
}

function darwinPlan(exe: string, script: string): PlanStep[] {
  const plistPath = join(
    homedir(),
    'Library/LaunchAgents',
    `com.${UNIT_NAME}.plist`,
  );
  const logPath = join(homedir(), 'Library/Logs', `${UNIT_NAME}.log`);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.${UNIT_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(exe)}</string>
    <string>${xml(script)}</string>
    <string>daemon</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TEXT_TO_DESIGN_MCP_ROLE</key>
    <string>daemon</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${xml(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(logPath)}</string>
</dict>
</plist>
`;
  return [
    // 已存在同名 agent:先卸再装,避免 "service already loaded"
    { kind: 'run', cmd: 'launchctl', args: ['unload', plistPath] },
    { kind: 'write', path: plistPath, content: plist },
    { kind: 'run', cmd: 'launchctl', args: ['load', '-w', plistPath] },
    { kind: 'note', line: `输出日志:${logPath}` },
  ];
}

function win32Plan(exe: string, script: string): PlanStep[] {
  // /TR 只接受一个字符串,内层路径各自加引号
  const target = `"${exe}" "${script}" daemon`;
  return [
    {
      kind: 'run',
      cmd: 'schtasks',
      args: [
        '/Create',
        '/F',
        '/SC',
        'ONLOGON',
        '/TN',
        UNIT_NAME,
        '/TR',
        target,
      ],
    },
    {
      kind: 'note',
      line: `登录即启动。立即拉起一次:schtasks /Run /TN ${UNIT_NAME}`,
    },
  ];
}

function planFor(exe: string, script: string): PlanStep[] {
  if (process.platform === 'linux') return linuxPlan(exe, script);
  if (process.platform === 'darwin') return darwinPlan(exe, script);
  if (process.platform === 'win32') return win32Plan(exe, script);
  return [];
}

function uninstallPlan(): PlanStep[] {
  if (process.platform === 'linux') {
    const unitPath = join(
      homedir(),
      '.config/systemd/user',
      `${UNIT_NAME}.service`,
    );
    return [
      {
        kind: 'run',
        cmd: 'systemctl',
        args: ['--user', 'disable', '--now', `${UNIT_NAME}.service`],
      },
      { kind: 'rm', path: unitPath },
      { kind: 'run', cmd: 'systemctl', args: ['--user', 'daemon-reload'] },
    ];
  }
  if (process.platform === 'darwin') {
    const plistPath = join(
      homedir(),
      'Library/LaunchAgents',
      `com.${UNIT_NAME}.plist`,
    );
    return [
      { kind: 'run', cmd: 'launchctl', args: ['unload', '-w', plistPath] },
      { kind: 'rm', path: plistPath },
    ];
  }
  if (process.platform === 'win32') {
    return [
      {
        kind: 'run',
        cmd: 'schtasks',
        args: ['/Delete', '/F', '/TN', UNIT_NAME],
      },
    ];
  }
  return [];
}

function execute(step: PlanStep, dryRun: boolean): void {
  if (step.kind === 'note') {
    log(`提示:${step.line}`);
    return;
  }
  if (step.kind === 'write') {
    if (dryRun) {
      log(`[dry-run] 写入 ${step.path}`);
      log(step.content.trimEnd());
      return;
    }
    mkdirSync(dirname(step.path), { recursive: true });
    writeFileSync(step.path, step.content, 'utf8');
    log(`已写入 ${step.path}`);
    return;
  }
  if (step.kind === 'rm') {
    if (dryRun) {
      log(`[dry-run] 删除 ${step.path}`);
      return;
    }
    rmSync(step.path, { force: true });
    log(`已删除 ${step.path}`);
    return;
  }
  if (dryRun) {
    log(`[dry-run] 执行 ${step.cmd} ${step.args.join(' ')}`);
    return;
  }
  const res = spawnSync(step.cmd, step.args, { encoding: 'utf8' });
  if (res.error) {
    // 系统管理器缺失(容器/精简系统):文件已就位,提示用户自行启用即可
    warn(
      `执行失败(${step.cmd}):${(res.error as NodeJS.ErrnoException).code ?? res.error.message} —— 定义文件已就位,可手动启用`,
    );
    return;
  }
  if (res.status !== 0) {
    warn(
      `${step.cmd} 退出码 ${res.status}: ${(res.stderr ?? '').trim().slice(0, 200)}`,
    );
    return;
  }
  log(`已执行 ${step.cmd} ${step.args.join(' ')}`);
}

function runPlan(steps: PlanStep[], dryRun: boolean): void {
  if (steps.length === 0) {
    error(`当前平台(${process.platform})暂不支持自动注册自启`);
    process.exit(1);
  }
  for (const step of steps) execute(step, dryRun);
}

/** 注册用户级自启:开机/登录即拉起 daemon,与 MCP 会话解耦 */
export function installService(opts: ServiceOptions = {}): void {
  const entry = resolveEntry();
  let exe: string;
  let script: string;
  if ('problem' in entry) {
    if (!opts.force) {
      error(entry.problem);
      process.exit(1);
    }
    warn(`${entry.problem}(--force 已跳过检查)`);
    exe = process.execPath;
    script = resolve(process.argv[1] ?? '');
  } else {
    exe = entry.exe;
    script = entry.script;
  }
  log(`${opts.dryRun ? '[dry-run] ' : ''}注册自启:${exe} ${script} daemon`);
  runPlan(planFor(exe, script), opts.dryRun === true);
  if (!opts.dryRun) {
    log(
      `完成。校验:curl -s http://127.0.0.1:${HTTP_PORT}/health(应返回 ${SERVER_NAME} ${SERVER_VERSION})`,
    );
  }
}

/** 注销自启并停止服务(不影响手动运行) */
export function uninstallService(opts: ServiceOptions = {}): void {
  log(`${opts.dryRun ? '[dry-run] ' : ''}注销自启`);
  runPlan(uninstallPlan(), opts.dryRun === true);
}
