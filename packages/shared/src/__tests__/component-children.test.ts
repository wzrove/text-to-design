import { describe, expect, it } from 'vitest';

import { createComponentNodes } from '../core/component';
import { runtimeContext } from '../core/runtime';
import { resizeContainer } from '../core/utils';
import { makeFrame, makeHost, makeRect } from './fixtures';

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

/**
 * 回归:组件尺寸必须**不改变子节点几何**(即时设计真机,2026-10-14)。
 *
 * 假宿主默认的 `resize` 只改自身宽高,**不建模约束**(fixtures.ts 的简化),
 * 所以上面那两条用例永远测不到真机的行为 —— 实测 jsDesign 上 `resize()` 会按
 * `constraints: SCALE` 把子节点**各轴独立等比缩放**:组件壳初始 100×100,收尾压
 * 375×44 时子节点被乘 (3.75, 0.44),`x=287` 的兄弟飞到 1076 → 超出 375 边界
 * 被 clipsContent 裁掉,导图上「只剩第一个子件」(见 docs/design-decisions/0044)。
 *
 * 这里把那个平台行为**装进假宿主**,用例才有判别力:旧代码(直接 `component.resize`)
 * 跑这组断言必挂。
 */
function makeComponentHostWithConstraintScaling() {
  const host = makeHost();
  const component = makeFrame('C:1', 'component');
  Object.assign(component as unknown as Record<string, unknown>, {
    type: 'COMPONENT',
    // jsDesign 的组件壳默认 100×100(0020 记录过同一事实)
    width: 100,
    height: 100,
    children: [],
  });
  Object.assign(component as unknown as Record<string, unknown>, {
    // 真实语义:resize 施加约束 ⇒ SCALE 子节点按 (w/oldW, h/oldH) 缩放
    resize(
      this: { width: number; height: number; children?: unknown[] },
      w: number,
      h: number,
    ) {
      const ratioX = w / this.width;
      const ratioY = h / this.height;
      for (const child of (this.children ?? []) as {
        x: number;
        y: number;
        width: number;
        height: number;
        constraints?: { horizontal: string; vertical: string };
      }[]) {
        const c = child.constraints ?? { horizontal: 'MIN', vertical: 'MIN' };
        if (c.horizontal === 'SCALE') {
          child.x *= ratioX;
          child.width *= ratioX;
        }
        if (c.vertical === 'SCALE') {
          child.y *= ratioY;
          child.height *= ratioY;
        }
      }
      this.width = w;
      this.height = h;
    },
    // 不施加约束的重载:只改尺寸(契约里的可选成员)
    resizeWithoutConstraints(
      this: { width: number; height: number },
      w: number,
      h: number,
    ) {
      this.width = w;
      this.height = h;
    },
  });
  (host as unknown as { createComponent: () => unknown }).createComponent =
    () => component;
  // 装节点工厂:jsDesign 组件里新建的子节点默认带 SCALE 约束(这正是差异来源,
  // 夹具里默认是 MIN —— 不装这一层,用例就没有判别力)。
  const h = host as unknown as Record<string, unknown>;
  for (const key of ['createFrame', 'createRectangle', 'createText'] as const) {
    const make = h[key] as (id?: string, name?: string) => unknown;
    h[key] = (id?: string, name?: string) => {
      const node = make(id, name);
      Object.assign(node as Record<string, unknown>, {
        constraints: { horizontal: 'SCALE', vertical: 'SCALE' },
      });
      return node;
    };
  }
  return { host, component };
}

describe('带内容建组件的几何不变式(0044)', () => {
  it('createComponentNodes 压尺寸不动子节点几何(SCALE 子节点也不动)', async () => {
    const { host } = makeComponentHostWithConstraintScaling();

    const { created } = await createComponentNodes(host, ctx, {
      name: '状态栏 / 默认',
      width: 375,
      height: 44,
      children: [
        {
          type: 'RECTANGLE',
          name: '信号',
          x: 287,
          y: 17,
          width: 18,
          height: 11,
        },
      ],
    });

    expect(created.name).toBe('状态栏 / 默认');
    expect(created.width).toBe(375);
    expect(created.height).toBe(44);
    const first = created.children?.[0];
    expect(first, '子节点必须还在').toBeDefined();
    // 关键断言:几何不被 (375/100, 44/100) 缩放
    expect(first?.x).toBe(287);
    expect(first?.y).toBe(17);
    expect(first?.width).toBe(18);
    expect(first?.height).toBe(11);
  });

  it('旧写法(直接 resize)在同一假宿主上确实会缩放 —— 证明本用例有判别力', () => {
    const { component } = makeComponentHostWithConstraintScaling();
    const child = makeRect('C:3', '信号');
    Object.assign(child as unknown as Record<string, unknown>, {
      x: 287,
      y: 17,
      width: 18,
      height: 11,
      constraints: { horizontal: 'SCALE', vertical: 'SCALE' },
    });
    (component as unknown as { children: unknown[] }).children = [child];
    (component as unknown as { resize: (w: number, h: number) => void }).resize(
      375,
      44,
    );
    expect((child as unknown as { x: number }).x).toBeCloseTo(1076.25);
  });
});

describe('resizeContainer 的择优与回退', () => {
  it('两个重载都在时走 withoutConstraints,子节点不动', () => {
    const { component } = makeComponentHostWithConstraintScaling();
    const child = makeRect('C:4', '信号');
    Object.assign(child as unknown as Record<string, unknown>, {
      x: 287,
      y: 17,
      width: 18,
      height: 11,
      constraints: { horizontal: 'SCALE', vertical: 'SCALE' },
    });
    (component as unknown as { children: unknown[] }).children = [child];

    expect(resizeContainer(component, 375, 44)).toBe('withoutConstraints');
    expect((child as unknown as { x: number }).x).toBe(287);
    expect((component as unknown as { width: number }).width).toBe(375);
  });

  it('本平台无该重载时(MasterGo)回退到 resize 并点名', () => {
    const node = makeFrame('M:1', 'only-resize');
    Object.assign(node as unknown as Record<string, unknown>, {
      resizeWithoutConstraints: undefined,
    });
    expect(resizeContainer(node, 10, 20)).toBe('constraints');
    expect((node as unknown as { width: number }).width).toBe(10);
    expect((node as unknown as { height: number }).height).toBe(20);
  });
});
