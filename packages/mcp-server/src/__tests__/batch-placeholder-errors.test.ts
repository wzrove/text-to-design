import { beforeEach, describe, expect, it } from 'vitest';
import { Bridge } from '../bridge';
import { lookupExecutor } from '../core/registry';
import { createMcpI18n } from '../i18n';
import { toolRegistrars } from '../tools';

/**
 * `jsd_batch` 的占位符失败语义(0044)。
 *
 * 两件此前混在一起、后果不同的事,现在分开了:
 *
 * ① **引用了计划里根本没有的步骤 id** —— 计划写错了,一律中止(与 id 重复、
 *    未知工具同级);`stopOnError:false` 也救不了,因为后面的步骤大概率同样写错。
 * ② **引用的步骤执行失败**(工具报错,或返回过不了 outputSchema —— 后者实测由
 *    平台私货值触发:绑了 fill style 的节点回读 `blendMode:"NOTTHROUGH"`,
 *    `serializeNode` 已收口,见 core/serialize.ts) —— 计划是对的,只是上游没拿到。
 *    这类必须受 `stopOnError` / `continueOnError` 管。
 *
 * 此前两者共用一条「一律 break」的分支,于是工具描述里承诺的
 * 「stopOnError=false 可走完全部」在占位符这条路径上是**空承诺**:
 * 实测一批 33 步只跑了 12 步就整批中止,而画布上其实已经改好了。
 */

type Reg = { name: string; cb: (...args: unknown[]) => Promise<unknown> };
const tools = new Map<string, Reg>();

const fakeServer = {
  registerTool: (
    name: string,
    _config: unknown,
    cb: (...args: unknown[]) => Promise<unknown>,
  ) => {
    tools.set(name, { name, cb });
    return { enable() {}, disable() {} };
  },
  registerResource: () => ({ enable() {}, disable() {} }),
  registerPrompt: () => ({ enable() {}, disable() {} }),
} as never;

interface BatchResult {
  ok?: boolean;
  executed?: number;
  total?: number;
  results?: { id: string; tool: string; ok: boolean; error?: string }[];
}

let bridge: Bridge;
const executed: string[] = [];

beforeEach(() => {
  executed.length = 0;
  bridge = new Bridge();
  bridge.request = async (method, params) => {
    const p = params as { ops?: { type?: string }[] };
    const type = p?.ops?.[0]?.type;
    executed.push(type ?? method);
    if (method === 'execute' && type === 'TEXT') {
      // 模拟「那一步失败」:工具回 isError(真实来源之一是回包过不了 outputSchema)
      throw new Error('模拟:该步执行失败');
    }
    return { created: [] };
  };
  for (const register of toolRegistrars) {
    register(fakeServer, bridge, createMcpI18n());
  }
});

async function runBatch(args: Record<string, unknown>): Promise<BatchResult> {
  const exec = lookupExecutor('jsd_batch');
  expect(exec, 'jsd_batch 未注册').toBeDefined();
  const out = (await exec?.(args, undefined)) as {
    structuredContent?: unknown;
  };
  return (out?.structuredContent ?? {}) as BatchResult;
}

/** 三步:坏步(TEXT)→ 依赖它的步 → 不依赖它的步 */
const threeSteps = [
  { id: 'bad', tool: 'jsd_create_text', args: { characters: 'x' } },
  {
    id: 'dep',
    tool: 'jsd_move_node',
    args: { ids: ['{{bad.created[0].id}}'], x: 1, y: 1 },
  },
  { id: 'free', tool: 'jsd_create_frame', args: { width: 1, height: 1 } },
];

describe('batch 占位符失败的容错语义(0044)', () => {
  it('stopOnError=false 时:引用失败步的那步被跳过,其余步骤照跑', async () => {
    const r = await runBatch({ calls: threeSteps, stopOnError: false });

    expect(r.executed, 'stopOnError=false 应当走完全部步骤').toBe(3);
    const byId = new Map((r.results ?? []).map((x) => [x.id, x]));
    expect(byId.get('bad')?.ok).toBe(false);
    expect(byId.get('dep')?.ok).toBe(false);
    // 关键:不依赖坏步的第三步必须真的执行了(此前整批在 dep 处中止)
    expect(byId.get('free')?.ok, '不依赖坏步的步骤被连坐中止了').toBe(true);
    expect(executed).toContain('FRAME');
  });

  it('失败步的引用错误文案说清「上游失败」而不是「步骤不存在」', async () => {
    const r = await runBatch({ calls: threeSteps, stopOnError: false });
    const dep = (r.results ?? []).find((x) => x.id === 'dep');
    expect(dep?.error).toContain('执行失败');
    expect(dep?.error).toContain('bad');
    // 给可执行的动作,不退化成一句「未成功」
    expect(dep?.error).toContain('stopOnError');
  });

  it('单步 continueOnError=true 同样能跳过(挂在失败的那一步上)', async () => {
    const r = await runBatch({
      calls: [
        { ...threeSteps[0], continueOnError: true },
        { ...threeSteps[1], continueOnError: true },
        threeSteps[2],
      ],
    });
    expect(r.executed).toBe(3);
    expect((r.results ?? []).find((x) => x.id === 'free')?.ok).toBe(true);
  });

  it('默认(stopOnError 缺省 = 首个失败即中止)语义不变', async () => {
    const r = await runBatch({ calls: threeSteps });
    // 默认语义不该被本次改动放松:第一步失败就停,不会往后跑
    expect(r.executed).toBe(1);
    expect((r.results ?? []).some((x) => x.id === 'free')).toBe(false);
  });

  it('引用计划里不存在的 id 仍是编排期错误:stopOnError=false 也不放过', async () => {
    const r = await runBatch({
      calls: [
        {
          id: 'dep',
          tool: 'jsd_move_node',
          args: { ids: ['{{nope.created[0].id}}'], x: 1, y: 1 },
        },
        { id: 'free', tool: 'jsd_create_frame', args: { width: 1, height: 1 } },
      ],
      stopOnError: false,
    });
    expect(r.executed, '计划写错必须中止,不能靠容错开关绕过').toBe(1);
    const dep = (r.results ?? []).find((x) => x.id === 'dep');
    expect(dep?.error).toContain('不存在或未成功');
  });
});
