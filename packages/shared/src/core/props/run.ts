import type { PropWriter, WriteCtx, WriteOutcome } from './types';

/**
 * 两阶段写入管线。
 *
 * phase 1 `write()`  —— 逐 writer 写属性;
 * phase 2 `settle()` —— 布局重算之后的回压(尺寸再压、方向回读)。
 *
 * 为什么是固定顺序的管线而不是责任链:每条检查/回压都**必须执行且不短路**,
 * 缺任一就漏一类诊断;责任链的价值在可短路与「调用方不知道谁处理」,这里两条
 * 都不成立(见设计决策 0004)。
 */
export async function runWriters(
  ctx: WriteCtx,
  writers: readonly PropWriter[],
): Promise<WriteOutcome> {
  for (const w of writers) {
    await w.write(ctx);
  }
  for (const w of writers) {
    await w.settle?.(ctx);
  }
  return ctx.outcome;
}

/** 只跑写入阶段(创建路径要把 settle 推迟到插完子节点之后) */
export async function writePhase(
  ctx: WriteCtx,
  writers: readonly PropWriter[],
): Promise<void> {
  for (const w of writers) {
    await w.write(ctx);
  }
}

/** 只跑稳定化阶段(创建路径在插完子节点后补跑) */
export async function settleWriters(
  ctx: WriteCtx,
  writers: readonly PropWriter[],
): Promise<void> {
  for (const w of writers) {
    await w.settle?.(ctx);
  }
}
