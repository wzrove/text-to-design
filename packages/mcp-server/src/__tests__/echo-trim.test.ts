import { describe, expect, it } from 'vitest';
import { trimEcho } from '../tools/batch';

/**
 * 回显裁剪的节点判据(dec 25827d0c 真机复验时撞出来的洞)。
 *
 * 旧判据是「有 id + name + type 三个字符串就算节点」,而**样式与变量的摘要恰好也是这三个
 * 字段**(`StyleSummary` / `AssetRef`)—— 于是 `figma_style_variables_list` 在批内的回显
 * 只剩 `{id,name,type}`,`values` 与 `boundVariables` 整片被收掉。调用方按「写完回读」
 * 的纪律去确认绑定,读到的是空壳,看起来就像没生效 —— dec 0007 要根除的正是这一类。
 * 真节点必带几何或父级字段,判据加严到那一项。
 */
describe('jsd_batch 回显裁剪', () => {
  it('节点对象收成摘要:几何与身份留下,渲染细节与嵌套子树不收', () => {
    const node = {
      id: '111:1',
      name: '主按钮',
      type: 'FRAME',
      x: 300,
      y: 300,
      width: 120,
      height: 60,
      z: 1,
      parentId: '108:1',
      children: [{ id: '111:2', name: '文本', type: 'TEXT', x: 0, y: 0 }],
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
      vectorPaths: 'x'.repeat(20000),
      absoluteBoundingBox: { x: 0, y: 0, width: 1, height: 1 },
      constraints: { horizontal: 'MIN', vertical: 'MIN' },
    };
    const out = trimEcho(node) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(
      [
        'height',
        'id',
        'name',
        'parentId',
        'type',
        'width',
        'x',
        'y',
        'z',
      ].sort(),
    );
    expect(out.fills).toBeUndefined();
    expect(out.children).toBeUndefined();
  });

  it('样式摘要(只有 id/name/type)不再被当节点收走 —— values/boundVariables 必须留着', () => {
    const style = {
      id: 'S:47d4d68c,',
      name: '探针/样式档色',
      type: 'PAINT',
      values: {
        paints: [
          {
            type: 'SOLID',
            color: { r: 0.9, g: 0.2, b: 0.2 },
            boundVariables: {
              color: { type: 'VARIABLE_ALIAS', id: 'VariableID:1:2' },
            },
          },
        ],
      },
      boundVariables: {
        paints: [{ type: 'VARIABLE_ALIAS', id: 'VariableID:1:2' }],
      },
    };
    const out = trimEcho(style) as Record<string, unknown>;
    expect(out.values).toBeDefined();
    expect(out.boundVariables).toEqual(style.boundVariables);
  });

  it('变量清单同理:集合与值原样透传', () => {
    const listed = {
      collections: [
        {
          id: 'VariableCollectionId:1',
          name: '令牌',
          defaultModeId: '1:0',
          modes: [],
        },
      ],
      variables: [
        {
          id: 'VariableID:1:2',
          name: 'accent',
          type: 'COLOR',
          collectionId: 'VariableCollectionId:1',
          values: { '1:0': { r: 1 } },
        },
      ],
      count: 1,
    };
    expect(trimEcho(listed)).toEqual(listed);
  });

  it('整键丢弃的渲染无关字段在任意深度都丢', () => {
    const out = trimEcho({
      steps: [{ id: 'a', vectorPaths: 'y'.repeat(100), constraints: {} }],
    }) as { steps: Record<string, unknown>[] };
    expect(out.steps[0]?.vectorPaths).toBeUndefined();
    expect(out.steps[0]?.constraints).toBeUndefined();
    expect(out.steps[0]?.id).toBe('a');
  });
});
