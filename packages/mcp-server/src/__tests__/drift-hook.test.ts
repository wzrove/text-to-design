import { beforeEach, describe, expect, it } from 'vitest';
import { Bridge } from '../bridge';
import { lookupExecutor } from '../core/registry';
import { toolRegistrars } from '../tools';
import { STRUCTURAL_NODE_OPS } from '../tools/drift-watch';

/**
 * 结构变更复核的覆盖面。
 *
 * 同一个平台缺陷(P25-B:删/移父之后引擎重算同层约束,把没碰到的兄弟静默挪走)
 * 此前只有 `jsd_batch` 内的步骤有复核,直接调 `jsd_delete_node` 没有 ——
 * 用户绕过编排就完全没保护。现在复核挂在工具定义上,任何调用路径都经过。
 *
 * 这里同时守两件事:
 * ① 覆盖面:单工具调用也会触发复核读数;
 * ② 名单唯一性:结构变更 op 的判定来自 STRUCTURAL_NODE_OPS 一份,不再是
 *    「drift-watch 手抄工具名」与「nodes.ts 的 opTool 清单」两份事实。
 */

type Reg = { name: string; cb: (...args: unknown[]) => Promise<unknown> };
const tools = new Map<string, Reg>();
const calls: { method: string; params: unknown }[] = [];

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

let bridge: Bridge;

beforeEach(() => {
  calls.length = 0;
  bridge = new Bridge();
  bridge.request = async (method, params) => {
    calls.push({ method, params });
    if (method === 'node_op') return { removed: ['1:2'] };
    return {};
  };
  for (const register of toolRegistrars) {
    register(fakeServer, bridge);
  }
});

describe('结构变更复核钩子', () => {
  it('单工具调用 jsd_delete_node 也会触发复核读数(此前只有 batch 内才有)', async () => {
    const exec = lookupExecutor('jsd_delete_node');
    expect(exec, 'jsd_delete_node 未注册').toBeDefined();
    const out = (await exec?.({ ids: ['1:2'] }, undefined)) as {
      isError?: boolean;
    };
    expect(out?.isError).not.toBe(true);

    // 删除本身一次 + 复核的「变更前记层 / 收尾比对」读数
    const structural = calls.filter((c) => c.method === 'node_op');
    const reads = calls.filter((c) => c.method !== 'node_op');
    expect(structural).toHaveLength(1);
    expect(reads.length, '单工具调用没有触发任何复核读数').toBeGreaterThan(0);
  });

  it('非结构变更工具不产生复核读数', async () => {
    const exec = lookupExecutor('jsd_clone_node');
    expect(exec).toBeDefined();
    await exec?.({ ids: ['1:2'] }, undefined);
    expect(calls.every((c) => c.method === 'node_op')).toBe(true);
  });

  /**
   * 聚合入口 jsd_manage_nodes:同一个钩子挂在它上面,由入参 op 决定要不要查。
   * 此前它**没挂**钩子 —— 于是「jsd_batch 里的 jsd_manage_nodes{op:'remove'}」
   * 这一步不复核,而固定 op 小工具有复核,同一份暴露面两种待遇。
   */
  it('聚合入口的结构变更 op 同样触发复核读数', async () => {
    const exec = lookupExecutor('jsd_manage_nodes');
    expect(exec, 'jsd_manage_nodes 未注册').toBeDefined();
    calls.length = 0;
    await exec?.({ op: 'remove', ids: ['1:2'] }, undefined);
    expect(calls.filter((c) => c.method === 'node_op')).toHaveLength(1);
    expect(
      calls.filter((c) => c.method !== 'node_op').length,
      '聚合入口没有触发任何复核读数',
    ).toBeGreaterThan(0);
  });

  it('聚合入口的非结构变更 op 不产生复核读数', async () => {
    const exec = lookupExecutor('jsd_manage_nodes');
    expect(exec).toBeDefined();
    calls.length = 0;
    await exec?.({ op: 'select', ids: ['1:2'] }, undefined);
    expect(calls.every((c) => c.method === 'node_op')).toBe(true);
  });

  it('checkDrift:false 真的关掉复核 —— 公开参数不能只是个摆设', async () => {
    const exec = lookupExecutor('jsd_batch');
    expect(exec).toBeDefined();
    calls.length = 0;
    await exec?.(
      {
        calls: [{ id: 'del', tool: 'jsd_delete_node', args: { ids: ['1:2'] } }],
        checkDrift: false,
      },
      undefined,
    );
    // 关闭后不应再有复核读数:只剩删除本身那一次插件往返
    expect(calls.filter((c) => c.method === 'node_op')).toHaveLength(1);
    expect(
      calls.filter((c) => c.method !== 'node_op'),
      'checkDrift:false 时仍产生了复核读数',
    ).toHaveLength(0);
  });

  it('不传 checkDrift 时默认开复核(向后兼容)', async () => {
    const exec = lookupExecutor('jsd_batch');
    expect(exec).toBeDefined();
    calls.length = 0;
    await exec?.(
      {
        calls: [{ id: 'del', tool: 'jsd_delete_node', args: { ids: ['1:2'] } }],
      },
      undefined,
    );
    expect(calls.filter((c) => c.method !== 'node_op').length).toBeGreaterThan(
      0,
    );
  });

  it('结构变更 op 名单是唯一真源,与旧的手抄清单一致', () => {
    expect([...STRUCTURAL_NODE_OPS].sort()).toEqual(
      ['flatten', 'group', 'remove', 'repair', 'reparent', 'ungroup'].sort(),
    );
  });

  it('每个结构变更 op 都注册成了带复核的工具', () => {
    const expected: Record<string, string> = {
      remove: 'jsd_delete_node',
      reparent: 'jsd_reparent_nodes',
      group: 'jsd_group_nodes',
      ungroup: 'jsd_ungroup_nodes',
      flatten: 'jsd_flatten_nodes',
      repair: 'jsd_repair_nodes',
    };
    for (const [op, tool] of Object.entries(expected)) {
      expect(STRUCTURAL_NODE_OPS.has(op), `${op} 漏登记`).toBe(true);
      expect(lookupExecutor(tool), `${tool} 未注册`).toBeDefined();
    }
  });
});
