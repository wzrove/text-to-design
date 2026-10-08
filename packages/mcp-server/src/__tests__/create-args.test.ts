import { describe, expect, it } from 'vitest';
import type { Bridge } from '../bridge';

/**
 * 单类型 create 工具的 `type` 口径(决策记录见 docs/design-decisions/0034)。
 *
 * 守三件在实战里出过事的事:
 * ① 顶层 `type` 带对要放行 —— 它和 children[] 内必填、jsd_batch.args 无约束是同一个心智;
 * ② 带错要精确指向 `type`(而不是让调用方以为整份入参不合法);
 * ③ **payload 必须剔除调用方传入的 type** —— 展开顺序错了就会「给 jsd_create_frame 传
 *    TEXT 建出 TEXT」,这正是本次改动引入的新风险面,得有回归。
 *
 * 直调 executor 是刻意为之:它复刻 jsd_batch 内层调用(唯一绕过 SDK 校验的路径),
 * 也是 /tmp/text-to-design-mcp.log 里那 5 条 `参数校验失败` 的真实来源。
 */

process.env.TEXT_TO_DESIGN_MCP_LOG = '/tmp/text-to-design-mcp-probe.log';

const { nodeCreateInputSchema } = await import('../tools/create');
const { describeInvalidArgs, lookupExecutor } = await import(
  '../core/registry'
);
const { buildServer } = await import('../server');
const { z } = await import('zod');

describe('单类型 create 工具的 type 口径(0034)', () => {
  it('顶层 type 等于工具固化的类型时放行', () => {
    const parsed = nodeCreateInputSchema('FRAME').safeParse({
      type: 'FRAME',
      width: 100,
    });
    expect(parsed.success).toBe(true);
  });

  it('顶层 type 不等于工具固化的类型时拒绝,且报错指向 type', () => {
    const parsed = nodeCreateInputSchema('FRAME').safeParse({
      type: 'TEXT',
      width: 100,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((i) => i.path[0] === 'type')).toBe(true);
  });

  it('strict 未被整体放宽:其他越界字段照拒', () => {
    expect(
      nodeCreateInputSchema('FRAME').safeParse({ kind: 'FRAME' }).success,
    ).toBe(false);
  });

  it('通道内仍可带 type:children 内的节点对象不受顶层口径影响', () => {
    const parsed = nodeCreateInputSchema('GROUP').safeParse({
      children: [
        { type: 'RECTANGLE', width: 10, height: 10 },
        { type: 'RECTANGLE', width: 10, height: 10 },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('越界字段点名:给可删的动作,不退化成 (root): Unrecognized key', () => {
    const message = describeInvalidArgs(
      z.object({ width: z.number() }),
      { type: 'FRAME', width: 1 },
      '(root): Unrecognized key: "type"',
    );
    expect(message).toContain('字段 [type]');
    expect(message).toContain('请删掉后重试');
    expect(message).toContain('该工具接受: [width]');
  });

  it('没有越界字段时保持原始 detail(缺必填等场景不改写)', () => {
    const detail = '(root): Required';
    expect(
      describeInvalidArgs(
        z.object({ width: z.number() }),
        { width: 1 },
        detail,
      ),
    ).toBe(detail);
  });

  it('直调 executor(jsd_batch 内层路径):带对 type 能走通,op 里的类型是固化值', async () => {
    let captured: { ops: Array<Record<string, unknown>> } | null = null;
    const bridge = {
      request: async (
        _method: string,
        params: { ops: Array<Record<string, unknown>> },
      ) => {
        captured = params;
        return { created: [] };
      },
    } as unknown as Bridge;
    buildServer(bridge);
    const exec = lookupExecutor('jsd_create_frame');
    expect(exec).toBeDefined();
    await exec?.({ type: 'FRAME', width: 10, height: 20 }, undefined);
    // TS 的控制流分析看不到回调里的赋值,故断言而不是可选链(captured 在回调外被收窄成 null)
    const sent = captured as unknown as { ops: Array<Record<string, unknown>> };
    expect(sent.ops[0].type).toBe('FRAME');
    expect(sent.ops[0].width).toBe(10);
    // op 里只有一个 type(payload 的剔除):带进来的那份不会在 rest 里留副本
    expect(Object.keys(sent.ops[0]).filter((k) => k === 'type')).toHaveLength(
      1,
    );
  });

  it('直调 executor:带错类型在 registry 出口就被拒,不向插件发往返', async () => {
    let called = false;
    const bridge = {
      request: async () => {
        called = true;
        return { created: [] };
      },
    } as unknown as Bridge;
    buildServer(bridge);
    const exec = lookupExecutor('jsd_create_frame');
    const out = (await exec?.({ type: 'TEXT', width: 10 }, undefined)) as {
      isError?: boolean;
      content?: Array<{ text?: string }>;
    };
    expect(called).toBe(false);
    expect(out.isError).toBe(true);
    expect(out.content?.[0]?.text ?? '').toContain('type');
  });
});
