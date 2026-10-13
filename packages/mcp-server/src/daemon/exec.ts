import type { Client } from '@modelcontextprotocol/client';
import type { BatchCall, BatchResult } from 'text-to-design-shared';
import { BATCH_TIMEOUT_MS, DAEMON_POLL_MS, DAEMON_WAIT_MS } from '../config';
import { loadBatchCallsFile } from '../core/calls-file';
import { error } from '../logger';
import { delay, probeUpstream } from './probe';
import { spawnDaemon } from './spawn';

/**
 * `text-to-design-mcp exec <calls.json>` —— 从文件跑一次 `jsd_batch`。
 *
 * 为什么要有这个入口:整页批量改造的清单里最占地方的是 id 数组(一份 bindings
 * 上千个 node id)。让模型把这些 id 逐字写进工具调用,一是上下文体量,二是**转写
 * 错一个就是静默漏改**。清单落成文件后,调用方只传一个路径。
 *
 * 为什么不是「让用户自己连 daemon 端口」:那条路的契约是内部传输(shim↔daemon)、
 * 端口可被 env 改、SDK 的安装路径属 pnpm 私有结构。把「脚本化执行」做成一个
 * 子命令,对外契约就只剩 CLI + JSON 形状(与 `jsd_batch` 的 calls 同形),内部
 * 怎么连、怎么换 daemon 版本都是本仓自己的事。
 *
 * 执行体复用 daemon 上已注册的同一个 `jsd_batch`:占位符、回显裁剪、漂移复核
 * 全都在服务端发生,这个命令不重新实现任何一步。
 */
export type ExecOptions = {
  /** 只把结果 JSON 打到 stdout(供管道消费),日志与计划改走 stderr */
  json?: boolean;
  /** 只解析并打印计划,不连 daemon、不执行 */
  dryRun?: boolean;
};

/** 连上 daemon;没有就按版本自检逻辑拉起,冷启动预算见 DAEMON_WAIT_MS */
async function connectDaemon(): Promise<Client> {
  const deadline = Date.now() + DAEMON_WAIT_MS;
  while (Date.now() < deadline) {
    const p = await probeUpstream();
    if (p.state === 'proxy') return p.client;
    if (p.state === 'foreign')
      throw new Error(
        'MCP 端口被**非本项目**的服务占用,exec 不会去猜它是什么。请先释放端口(见 daemon 启动日志里的排查提示)。',
      );
    // none=daemon 不在(杀掉/未起) → 拉起;starting=在跑但未就绪 → 只等待
    // 只传入口(process.argv.slice(1,2)):exec 这个子命令不能带给被拉起的 daemon,
    // 否则它会再按 exec 跑一遍(见 spawn.ts 的 argvOverride 注释)
    if (p.state === 'none') spawnDaemon(process.argv.slice(1, 2));
    await delay(DAEMON_POLL_MS);
  }
  throw new Error(
    `等待 daemon 就绪超时(${DAEMON_WAIT_MS}ms)。若刚从旧版本升级,旧 daemon 可能还没释放端口,稍后重试即可。`,
  );
}

function printPlan(
  path: string,
  calls: BatchCall[],
  stopOnError: boolean,
  toStderr: boolean,
): void {
  const out = (line: string): void => {
    if (toStderr) process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  };
  out(`清单 ${path}`);
  out(
    `共 ${calls.length} 步${stopOnError ? '(任一步失败即停)' : '(失败继续,由单步 continueOnError 决定)'}`,
  );
  for (const [i, c] of calls.entries())
    out(
      `  ${String(i + 1).padStart(2)}. ${c.id == null || c.id === '' ? `step${i + 1}` : c.id} → ${c.tool}`,
    );
}

export async function runExec(input: string, opts: ExecOptions): Promise<void> {
  const plan = await loadBatchCallsFile(input);
  const stopOnError = plan.stopOnError ?? true;
  printPlan(plan.path, plan.calls, stopOnError, opts.json === true);

  if (opts.dryRun === true) {
    process.stdout.write(
      '--dry-run:只校验了清单,未连接 daemon,未执行任何步骤。\n',
    );
    return;
  }

  const client = await connectDaemon();
  try {
    const res = await client.callTool(
      {
        name: 'jsd_batch',
        arguments: {
          calls: plan.calls,
          stopOnError,
          checkDrift: plan.checkDrift,
        },
      },
      // 单次请求超时要比 batch 自身的预算宽:batch 超时会给出「哪一步卡住」,
      // 客户端先超时只会得到一句 AbortError
      { timeout: BATCH_TIMEOUT_MS + 30_000 },
    );

    if (opts.json === true) {
      process.stdout.write(
        `${JSON.stringify(res.structuredContent ?? res, null, 1)}\n`,
      );
    } else {
      const r = res.structuredContent as BatchResult | undefined;
      for (const step of r?.results ?? [])
        process.stdout.write(
          `  ${step.ok ? 'ok ' : 'ERR'} ${step.id} (${step.tool})${step.ok ? '' : `: ${step.error ?? ''}`}\n`,
        );
      process.stdout.write(
        `\n执行 ${r?.executed ?? 0}/${r?.total ?? plan.calls.length}${r?.ok === false ? ',存在失败步骤' : ',全部成功'}\n`,
      );
      for (const w of r?.warnings ?? []) process.stdout.write(`warn ${w}\n`);
      if (res.isError === true) {
        const text = (res.content ?? [])
          .map((c) => ('text' in c && typeof c.text === 'string' ? c.text : ''))
          .join('\n');
        process.stderr.write(`\n${text}\n`);
      }
    }

    const failed =
      (res.structuredContent as BatchResult | undefined)?.ok === false;
    if (res.isError === true || failed) process.exitCode = 1;
  } finally {
    await client.close().catch(() => {});
  }
}

/** index.ts 用:把异常转成「一行点名 + 退出码 1」,不打印调用栈 */
export async function runExecCli(argv: string[]): Promise<void> {
  const file = argv.find((a) => !a.startsWith('-'));
  const opts: ExecOptions = {
    json: argv.includes('--json'),
    dryRun: argv.includes('--dry-run'),
  };
  if (file == null) {
    error(
      '用法:text-to-design-mcp exec <calls.json> [--json] [--dry-run]\n' +
        '  calls.json 形状与 jsd_batch 的 calls 一致:{"calls":[…]}(可带 stopOnError / checkDrift),或直接给一个数组。',
    );
    process.exitCode = 1;
    return;
  }
  try {
    await runExec(file, opts);
  } catch (e) {
    // error() 已同时落盘与外发终端,这里不再补一条 log —— 否则同一句话打两遍
    error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
