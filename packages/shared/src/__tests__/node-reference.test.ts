import { describe, expect, it } from 'vitest';
import {
  buildNodeReference,
  type CodeRole,
  type CopyRequest,
  copyRequestSchema,
  normalizeCodeRoles,
  parseNodeReference,
} from '../index';

function request(): Extract<CopyRequest, { mode: 'code' }> {
  return {
    mode: 'code',
    roles: ['backend', 'frontend'],
    scope: 'selection',
    requestedIds: ['1:1', '1:2'],
    source: { platform: 'figma', pageName: '登录页', selectionSeq: 7 },
  };
}

describe('节点引用 URL', () => {
  it('单节点沿用 jsd://node/{id} 且只含定位字段', () => {
    const text = buildNodeReference({
      mode: 'design',
      scope: 'node',
      requestedIds: ['1:1'],
      source: { platform: 'figma', pageName: '登录页', selectionSeq: 7 },
    });
    expect(text).toMatch(/^jsd:\/\/node\/1%3A1\?/);
    expect(text).not.toContain('登录面板');
    expect(text).not.toContain('selection JSON');
    expect(parseNodeReference(text)).toEqual({
      version: 1,
      mode: 'design',
      roles: [],
      skill: null,
      scope: 'node',
      requestedIds: ['1:1'],
      source: { platform: 'figma', pageName: '登录页', selectionSeq: 7 },
    });
  });

  it('整组使用重复 id，code roles 固定顺序并路由 design-to-code', () => {
    const text = buildNodeReference(request());
    const url = new URL(text);
    expect(url.hostname).toBe('canvas');
    expect(url.pathname).toBe('/selection');
    expect(url.searchParams.getAll('id')).toEqual(['1:1', '1:2']);
    expect(url.searchParams.get('roles')).toBe('frontend,backend');
    expect(url.searchParams.get('skill')).toBe('design-to-code');
    expect(url.searchParams.get('page')).toBe('登录页');
    expect(text).not.toContain('DATA:');
    expect(text).not.toContain('{');
    expect(parseNodeReference(text).requestedIds).toEqual(['1:1', '1:2']);
  });

  it.each(['jsdesign', 'figma', 'mastergo'] as const)('%s 保留平台引用', (platform) => {
    const text = buildNodeReference({
      ...request(),
      source: { ...request().source, platform },
    });
    expect(parseNodeReference(text).source.platform).toBe(platform);
  });

  it('构造后修改 roles/IDs 不影响已生成链接', () => {
    const roles: CodeRole[] = ['frontend'];
    const requestedIds = ['1:1'];
    const text = buildNodeReference({
      ...request(),
      scope: 'node',
      roles,
      requestedIds,
    });
    roles.push('backend');
    requestedIds.push('1:2');
    expect(parseNodeReference(text)).toMatchObject({
      roles: ['frontend'],
      requestedIds: ['1:1'],
    });
  });

  it('缺平台/页面时明确失败', () => {
    expect(() => buildNodeReference({
      ...request(),
      source: { platform: null, pageName: '登录页', selectionSeq: null },
    })).toThrow(/平台/);
    expect(() => buildNodeReference({
      ...request(),
      source: { platform: 'figma', pageName: ' ', selectionSeq: null },
    })).toThrow(/页面/);
  });

  it('未选择节点或 node 多 ID 被 schema 拒绝', () => {
    expect(() => copyRequestSchema.parse({ ...request(), requestedIds: [] })).toThrow();
    expect(() => copyRequestSchema.parse({
      ...request(),
      scope: 'node',
      requestedIds: ['1:1', '1:2'],
    })).toThrow(/只能包含一个/);
  });

  it('角色去重和未知角色处理明确', () => {
    expect(normalizeCodeRoles(['backend', 'frontend', 'backend'])).toEqual([
      'frontend',
      'backend',
    ]);
    expect(() => normalizeCodeRoles([])).toThrow(/至少选择/);
    expect(() => normalizeCodeRoles(['mobile'])).toThrow(/不支持/);
  });

  it.each([
    '',
    'not-a-url',
    'https://example.com/node/1%3A1',
    'jsd://other/thing?v=1&mode=design&platform=figma&page=p',
    'jsd://node/1%3A1?v=2&mode=design&platform=figma&page=p',
    'jsd://node/1%3A1?v=1&mode=code&roles=mobile&skill=design-to-code&platform=figma&page=p',
    'jsd://node/1%3A1?v=1&mode=design&platform=figma&page=p&unexpected=x',
    'jsd://node/%?v=1&mode=design&platform=figma&page=p',
  ])('无法解析或不合法链接明确失败: %s', (text) => {
    expect(() => parseNodeReference(text)).toThrow();
  });

  it('重复 id、错误 roles 顺序和重复 seq 均被拒绝', () => {
    const duplicate = buildNodeReference(request()) + '&id=1%3A1';
    expect(() => parseNodeReference(duplicate)).toThrow(/重复/);
    const wrongRoles = buildNodeReference(request()).replace(
      'roles=frontend%2Cbackend',
      'roles=backend%2Cfrontend',
    );
    expect(() => parseNodeReference(wrongRoles)).toThrow(/roles/);
    const duplicateSeq = buildNodeReference(request()) + '&seq=8';
    expect(() => parseNodeReference(duplicateSeq)).toThrow(/seq/);
  });
});
