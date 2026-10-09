import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSvgInputSchema } from 'text-to-design-shared';
import { describe, expect, it } from 'vitest';
import type { Bridge } from '../bridge';

/**
 * `jsd_create_svg` 的来源二选一(0035 的变更历史)。
 *
 * 守三件事:
 * ① 线格式与工具入参**不混用** —— `createSvgSchema`(插件协议)仍要求 svg 必填,
 *    来源选择只活在 MCP 侧;混了两边,插件侧就要处理它没有的读盘能力;
 * ② 只传一个才放行,两个都给 / 都不给都明确报错(静默取其一 = 调用方以为自己传的生效了);
 * ③ 读盘真的发生:这是「代码生成 SVG → 落盘 → 导入」那条路的地基,
 *    读失败/读空必须是人话报错,而不是把难懂的引擎解析错抛给调用方。
 */

process.env.TEXT_TO_DESIGN_MCP_LOG = '/tmp/text-to-design-mcp-probe.log';

const { lookupExecutor } = await import('../core/registry');
const { buildServer } = await import('../server');

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>';

/** 记录每次下发的 params,并按 createdResultSchema 回一个合法节点 */
function stubBridge(): {
  bridge: Bridge;
  sent: { method: string; params: Record<string, unknown> }[];
} {
  const sent: { method: string; params: Record<string, unknown> }[] = [];
  const bridge = {
    request: async (method: string, params: Record<string, unknown>) => {
      sent.push({ method, params });
      return {
        created: { id: '1:9', name: 'svg-design', type: 'FRAME', x: 0, y: 0 },
      };
    },
  } as unknown as Bridge;
  return { bridge, sent };
}

async function callCreateSvg(args: Record<string, unknown>): Promise<{
  isError?: boolean;
  text: string;
  sent: { method: string; params: Record<string, unknown> }[];
}> {
  const { bridge, sent } = stubBridge();
  buildServer(bridge);
  const exec = lookupExecutor('jsd_create_svg');
  const out = (await exec?.(args, undefined)) as {
    isError?: boolean;
    content?: { text?: string }[];
  };
  return { isError: out.isError, text: out.content?.[0]?.text ?? '', sent };
}

describe('createSvgInputSchema:来源二选一', () => {
  it('只传 svg 或只传 svgPath 都放行', () => {
    expect(createSvgInputSchema.safeParse({ svg: SVG }).success).toBe(true);
    expect(
      createSvgInputSchema.safeParse({ svgPath: '/tmp/a.svg' }).success,
    ).toBe(true);
  });

  it('两个都给 / 都不给都拒,且报错指向 svg', () => {
    const both = createSvgInputSchema.safeParse({
      svg: SVG,
      svgPath: '/tmp/a.svg',
    });
    expect(both.success).toBe(false);
    expect(both.success === false && both.error.issues[0].path).toEqual([
      'svg',
    ]);
    expect(both.success === false && both.error.issues[0].message).toContain(
      '只能传一个',
    );

    const none = createSvgInputSchema.safeParse({ name: 'x' });
    expect(none.success).toBe(false);
    expect(none.success === false && none.error.issues[0].message).toContain(
      '二选一',
    );
  });

  it('空串不算「传了」', () => {
    expect(
      createSvgInputSchema.safeParse({ svg: '', svgPath: '/tmp/a.svg' })
        .success,
    ).toBe(true);
    expect(createSvgInputSchema.safeParse({ svg: '   ' }).success).toBe(false);
  });

  it('strict 未被放宽:越界字段照拒', () => {
    expect(
      createSvgInputSchema.safeParse({ svg: SVG, content: SVG }).success,
    ).toBe(false);
  });
});

describe('jsd_create_svg:两种来源都能落到 create_svg', () => {
  it('内联字符串:原样下发,缺省名 svg-design', async () => {
    const { isError, sent } = await callCreateSvg({ svg: SVG });
    expect(isError).toBeFalsy();
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('create_svg');
    expect(sent[0].params).toEqual({ svg: SVG, name: 'svg-design' });
  });

  it('文件路径:由服务端读盘后下发(模型不必把源码塞进入参)', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ttd-svg-')), 'chart.svg');
    writeFileSync(file, SVG, 'utf8');
    const { isError, sent } = await callCreateSvg({
      svgPath: file,
      name: 'chart',
    });
    expect(isError).toBeFalsy();
    expect(sent).toHaveLength(1);
    expect(sent[0].params).toEqual({ svg: SVG, name: 'chart' });
  });

  it('文件不存在 / 文件为空:人话报错,不向插件发往返', async () => {
    const missing = await callCreateSvg({
      svgPath: '/tmp/definitely-missing-chart.svg',
    });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('读取 SVG 文件失败');
    expect(missing.sent).toHaveLength(0);

    const file = join(mkdtempSync(join(tmpdir(), 'ttd-svg-')), 'empty.svg');
    writeFileSync(file, '   \n', 'utf8');
    const empty = await callCreateSvg({ svgPath: file });
    expect(empty.isError).toBe(true);
    expect(empty.text).toContain('SVG 文件是空的');
    expect(empty.sent).toHaveLength(0);
  });

  it('两个来源都给:在 registry 出口被拒,不向插件发往返', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ttd-svg-')), 'chart.svg');
    writeFileSync(file, SVG, 'utf8');
    const { isError, text, sent } = await callCreateSvg({
      svg: SVG,
      svgPath: file,
    });
    expect(isError).toBe(true);
    expect(text).toContain('只能传一个');
    expect(sent).toHaveLength(0);
  });
});
