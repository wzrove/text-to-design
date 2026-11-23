import { describe, expect, it } from 'vitest';
import {
  CANVAS_READ_METHODS,
  isCanvasReadRequest,
} from '../dicts/canvas-readonly';
import type { PluginMethod } from '../index';

/**
 * 写方法清单带类型:新增 PluginMethod 而不在两侧归类,这里先编译失败 ——
 * 漏归类的那条会默认被当成写(安全侧),但没人知道它该不该读。
 */
type ReadMethod = (typeof CANVAS_READ_METHODS)[number];
const WRITE_METHODS: Exclude<PluginMethod, ReadMethod>[] = [
  'execute',
  'create_svg',
  'fill_image',
  'create_style',
  'delete_style',
  // 只封撤销边界、不改画布内容,但它是写入链路的一部分(代码模式下不该发生)
  'commit_undo',
  'node_op',
  'component_op',
  'platform_op',
  'set_fill',
  'set_stroke',
  'set_corner_radius',
  'set_text',
  'move',
  'resize',
  'set_layout',
  'set_effects',
  'set_visibility',
  'rename',
  'set_shape',
];

describe('画布只读策略(代码模式)', () => {
  it('登记过的方法一律放行', () => {
    for (const method of CANVAS_READ_METHODS)
      expect(isCanvasReadRequest(method, {})).toBe(true);
  });

  it('其余方法一律按写拒绝', () => {
    for (const method of WRITE_METHODS)
      expect(isCanvasReadRequest(method, { op: 'select' })).toBe(false);
  });

  it('容器方法只有登记的子 op 放行', () => {
    expect(isCanvasReadRequest('component_op', { op: 'copy_overrides' })).toBe(
      true,
    );
    expect(isCanvasReadRequest('component_op', { op: 'detach_instance' })).toBe(
      false,
    );
    expect(isCanvasReadRequest('node_op', { op: 'select' })).toBe(false);
    expect(
      isCanvasReadRequest('platform_op', { op: 'jsd_component_facts' }),
    ).toBe(false);
  });

  it('坏 params 不放行', () => {
    expect(isCanvasReadRequest('component_op', null)).toBe(false);
    expect(isCanvasReadRequest('component_op', { op: 1 })).toBe(false);
    expect(isCanvasReadRequest('component_op', 'copy_overrides')).toBe(false);
  });
});
