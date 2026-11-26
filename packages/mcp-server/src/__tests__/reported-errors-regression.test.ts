import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * 回归:error_reports 里 8 类真实报错(2026-11-15,2 个 user_id)。
 *
 * 每条用例对着**附件里的原始入参形态**跑,守住两个方向:
 * ① 修过的类不再产生校验失败(或文案已能自证根因);
 * ② 没改的类保持既有语义 —— 不为迁就改动去放宽约束。
 *
 * 这些断言全部来自线上记录,不是设想出来的边界。
 */

process.env.TEXT_TO_DESIGN_MCP_LOG = '/tmp/text-to-design-mcp-regress.log';

const {
  nodeCreateInputSchema,
  CREATE_EXCLUSIVE_FIELDS,
  CREATE_MISPLACED_ID_FIELDS,
} = await import('../tools/create');
const { describeInvalidArgs } = await import('../core/schema-error');
const shared = await import('text-to-design-shared');

describe('第1类 jsd_manage_nodes 缺 op', () => {
  it('缺 op 时给出「无效 op(缺省)」与完整可选值', () => {
    const r = shared.manageNodesSchema.safeParse({ ids: ['1:2'] });
    expect(r.success).toBe(false);
    const msgs = r.error?.issues.map((i) => i.message).join(' ') ?? '';
    expect(msgs).toContain('无效 op(缺省)');
    expect(msgs).toContain('jsd_manage_components');
  });

  it('op 合法但缺 ids 时点名到字段', () => {
    const r = shared.manageNodesSchema.safeParse({ op: 'reparent' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message).join(' ')).toContain('ids');
  });
});

describe('第2类 ids 元素为 undefined', () => {
  it('reparent 的空位不再逐个报 zod 原文,而是给出成因', () => {
    const r = shared.reparentNodesSchema.safeParse({
      ids: [undefined, undefined, undefined],
    });
    expect(r.success).toBe(false);
    const msgs = r.error?.issues.map((i) => i.message).join(' ') ?? '';
    expect(msgs).toContain('空元素');
    expect(msgs).toContain('jsd_find');
  });

  it('空串元素同样被拦', () => {
    const r = shared.reparentNodesSchema.safeParse({ ids: ['1:2', ''] });
    expect(r.success).toBe(false);
  });

  it('正常 ids 不受影响', () => {
    expect(
      shared.reparentNodesSchema.safeParse({ ids: ['1:2', '3:4'] }).success,
    ).toBe(true);
  });
});

describe('第3类 jsd_export 传 id 而非 ids', () => {
  it('单数 id 被归一化成 ids 数组(不再报 Unrecognized key)', () => {
    const r = shared.exportSchema.safeParse({ id: '1:2' });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ ids: ['1:2'] });
  });

  it('数组形态的 id 同样归一化', () => {
    const r = shared.exportSchema.safeParse({ id: ['1:2', '3:4'] });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ ids: ['1:2', '3:4'] });
  });

  it('ids 原样通过,行为不变', () => {
    const r = shared.exportSchema.safeParse({ ids: ['1:2'], format: 'PNG' });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ ids: ['1:2'], format: 'PNG' });
  });

  it('两者都给:以 ids 为准,id 仍被 strict 点名(不静默二选一)', () => {
    const r = shared.exportSchema.safeParse({ id: '1:2', ids: ['3:4'] });
    expect(r.success).toBe(false);
  });

  it('空 ids 仍被拒', () => {
    expect(shared.exportSchema.safeParse({ ids: [] }).success).toBe(false);
  });
});

describe('第4类 jsd_create_ellipse 收到文本字段', () => {
  it('原文案保留,并追加上归属工具', () => {
    const schema = nodeCreateInputSchema('ELLIPSE');
    const args = {
      characters: 'hi',
      fills: [],
      fontName: { family: 'Inter' },
      fontSize: 12,
      name: 'e',
      placement: {},
      x: 1,
      y: 2,
    };
    const parsed = schema.safeParse(args);
    expect(parsed.success).toBe(false);
    const detail =
      parsed.error?.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ') ?? '';
    const message = describeInvalidArgs(
      schema,
      args,
      detail,
      CREATE_EXCLUSIVE_FIELDS,
    );
    // 原本的两句必须原样保留(不改已有报错语义)
    expect(message).toContain('字段 [characters, fontName, fontSize]');
    expect(message).toContain('不被该工具接受');
    expect(message).toContain('该工具接受 36 个字段');
    // 新增:指到真正该用的工具
    expect(message).toContain('jsd_create_text');
  });

  it('归属表由 schema 派生:文本独有字段只归属 jsd_create_text', () => {
    for (const f of ['characters', 'fontSize', 'fontName']) {
      expect(CREATE_EXCLUSIVE_FIELDS.get(f)?.tool).toBe('jsd_create_text');
    }
  });

  it('共享字段不进归属表(归属不唯一,说了反而误导)', () => {
    for (const f of ['fills', 'width', 'name', 'x', 'y']) {
      expect(CREATE_EXCLUSIVE_FIELDS.get(f)).toBeUndefined();
    }
  });

  it('越界字段分属两个工具时不加归属提示', () => {
    const schema = z.object({ width: z.number() }).strict();
    const args = { characters: 'x', pointCount: 5, width: 1 };
    const message = describeInvalidArgs(
      schema,
      args,
      '(root): Unrecognized keys',
      CREATE_EXCLUSIVE_FIELDS,
    );
    expect(message).not.toContain('这组字段属于');
  });
});

describe('第5类 jsd_set_effects 漏 arcData.innerRadius', () => {
  it('漏 innerRadius 仍被拒(约束不放宽),文案说明省略不等于 0', () => {
    const r = shared.setEffectsSchema.safeParse({
      ids: ['1:2'],
      arcData: { startingAngle: 0, endingAngle: 180 },
    });
    expect(r.success).toBe(false);
    const issue = r.error?.issues.find((i) =>
      i.path.join('.').includes('innerRadius'),
    );
    expect(issue).toBeDefined();
  });

  it('显式 innerRadius: 0(实心扇形)通过', () => {
    const r = shared.setEffectsSchema.safeParse({
      ids: ['1:2'],
      arcData: { startingAngle: 0, endingAngle: 180, innerRadius: 0 },
    });
    expect(r.success).toBe(true);
  });
});

describe('第6类 jsd_create_icon 未知图标', () => {
  it('废弃名 alert-circle 能解析到正式名(别名表生效)', async () => {
    const { findIcon } = await import('../icons');
    const def = findIcon('alert-circle');
    // lucide 1.77 把 alert 系列改名为 exclamation-point,别名表随构建重新生成
    expect(def?.name).toBe('circle-exclamation-point');
  });

  it('图标库版本可读,用于区分「版本漂移」与「真没有这个名字」', async () => {
    const { LUCIDE_VERSION, ICON_COUNT } = await import('../icons');
    expect(LUCIDE_VERSION).not.toBe('unknown');
    expect(ICON_COUNT).toBeGreaterThan(1000);
  });

  it('别名目标是正式名时直接命中,不走模糊层(否则 alert-circle 会被召回成 message-circle-*)', async () => {
    const { findIcon } = await import('../icons');
    // 这是附件里那条报错的直接对照:报错给出的候选全是 message-circle/loader-circle,
    // 说明当时走的是模糊层而非别名层 —— 别名生效时必须命中 canonical 的 exclamation-point。
    expect(findIcon('alert-circle')?.name).toBe('circle-exclamation-point');
    expect(findIcon('alert circle')?.name).toBe('circle-exclamation-point');
  });
});

describe('第8类 jsd_reparent_nodes 被取消', () => {
  it('未发出即取消与发出后取消的文案可区分', async () => {
    const { PendingManager } = await import('../pending');
    const manager = new PendingManager(() => {});
    const pre = new AbortController();
    pre.abort();
    await expect(
      manager.request('node_op', {}, { signal: pre.signal }),
    ).rejects.toThrow(/尚未发出/);

    const late = new AbortController();
    const p = manager.request('node_op', {}, { signal: late.signal });
    late.abort();
    await expect(p).rejects.toThrow(/已耗时 \d+ms/);
  });
});

/**
 * 2026-11-17 在线记录里新增的几类(与上面 11-15 那批同源,按 last_seen 当天筛出)。
 * 同样每条都对着线上原始入参,断言的是「下一轮能自己走出来」,不是「报错变好看」。
 */
describe('第9类 jsd_create_rectangle 收到 id', () => {
  it('越界字段给出替代路径,而不是只说不接受', () => {
    const schema = nodeCreateInputSchema('RECTANGLE');
    const args = {
      id: '1:2',
      name: 'r',
      width: 10,
      height: 10,
      x: 1,
      y: 2,
      cornerRadius: 4,
      fills: [],
      strokes: [],
      strokeWeight: 1,
      placement: {},
    };
    const parsed = schema.safeParse(args);
    expect(parsed.success).toBe(false);
    const detail =
      parsed.error?.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ') ?? '';
    const message = describeInvalidArgs(
      schema,
      args,
      detail,
      CREATE_EXCLUSIVE_FIELDS,
      CREATE_MISPLACED_ID_FIELDS,
    );
    expect(message).toContain('字段 [id]');
    // 关键:说清 id 从哪来、该用哪类工具,而不是让调用方再猜
    expect(message).toContain('不能预先指定');
    expect(message).toContain('jsd_move_node');
  });

  it('id 不会被放行(schema 不放宽)', () => {
    expect(
      nodeCreateInputSchema('RECTANGLE').safeParse({ id: '1:2' }).success,
    ).toBe(false);
  });
});

describe('第10类 jsd_create_icon 未知图标 oil-can', () => {
  it('多词名按词召回:候选里有 can / spray-can 这类真正同物件的名字', async () => {
    // oil-can 在 lucide 1.74 里确实不存在(全库只有 fuel 沾边),所以这里不要求
    // 「能解析」,只要求候选对得上:线上那条报错的候选是 tool-case/candy-cane 这种
    // 前缀巧合 —— 调用方拿它去试只会再错一轮。
    const { findIcon, suggestIcons } = await import('../icons');
    expect(findIcon('oil-can')).toBeNull();
    const names = suggestIcons('oil-can', 8).map((d) => d.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.some((n) => n === 'can' || n === 'spray-can')).toBe(true);
    expect(names[0]).not.toBe('tool-case');
  });

  it('拼写失误仍走编辑距离:arrowlft → arrow-left', async () => {
    const { suggestIcons } = await import('../icons');
    expect(suggestIcons('arrowlft', 5)[0]?.name).toBe('arrow-left');
  });
});

describe('2026-11-26 线上记录回归', () => {
  it('jsd_create_frame 收到单数 fill 时提示改用复数 fills', () => {
    const schema = nodeCreateInputSchema('FRAME');
    const args = { name: 'card', width: 100, height: 100, fill: '#fff' };
    const parsed = schema.safeParse(args);
    expect(parsed.success).toBe(false);
    const detail =
      parsed.error?.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ') ?? '';
    const message = describeInvalidArgs(
      schema,
      args,
      detail,
      CREATE_EXCLUSIVE_FIELDS,
      CREATE_MISPLACED_ID_FIELDS,
    );
    expect(message).toContain('fills');
  });

  it('PendingManager silentErrorCodes 将旧插件 unknown_method 降级为 warn(仍 reject 供调用方提醒升级)', async () => {
    const { PendingManager } = await import('../pending');
    const sent: string[] = [];
    const manager = new PendingManager((text) => sent.push(text));
    const p = manager.request(
      'commit_undo',
      {},
      { silentErrorCodes: ['unknown_method'] },
    );
    const req = JSON.parse(sent[0]) as { id: string };
    manager.onText(
      Buffer.from(
        JSON.stringify({
          type: 'response',
          id: req.id,
          ok: false,
          error: { code: 'unknown_method', message: '未知方法: commit_undo' },
        }),
      ),
    );
    await expect(p).rejects.toThrow(/未知方法/);
  });
});
