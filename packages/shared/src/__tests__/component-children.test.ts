import { describe, expect, it } from 'vitest';

import { createComponentNodes } from '../core/component';
import { runtimeContext } from '../core/runtime';
import { makeHost } from './fixtures';

/**
 * 建组件的「带内容一次建成」基线(0020)。
 *
 * 改之前 create_component 只出空壳,带内容的组件要靠调用方
 * 「建壳 → resize → 建内容帧 → reparent → 内层归零」5 次调用拼出来,
 * 且 MG 上会撞「children 里传 COMPONENT 被降级成 FRAME」。
 *
 * 这里钉两件事:① children 直接落进组件(不用再 reparent);
 * ② width/height 在子节点插完之后才压(写在前面会被布局重算吃掉)。
 *
 * ⚠ 夹具的 createComponent 返回的是 INSTANCE 形态的假节点(fixtures.ts 的简化),
 * 故不断言 type === 'COMPONENT',只断言结构。
 */
const ctx = runtimeContext(null);

describe('createComponentNodes', () => {
  it('带 children 时一次建成带内容的组件', async () => {
    const host = makeHost();
    const { created } = await createComponentNodes(host, ctx, {
      name: 'Type=Primary, State=Default',
      width: 176,
      height: 36,
      children: [{ type: 'TEXT', characters: '主要按钮' }],
    });

    expect(created.name).toBe('Type=Primary, State=Default');
    expect(created.width).toBe(176);
    expect(created.height).toBe(36);
    expect(created.children ?? []).toHaveLength(1);
    expect(created.children?.[0]?.characters).toBe('主要按钮');
  });

  it('不传 children 仍是空壳,且 ids 可选', async () => {
    const host = makeHost();
    const { created } = await createComponentNodes(host, ctx, {
      name: 'Empty',
    });
    expect(created.children ?? []).toHaveLength(0);
  });
});
