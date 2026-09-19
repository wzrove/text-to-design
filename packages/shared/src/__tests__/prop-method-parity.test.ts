import { describe, expect, it } from 'vitest';
import type { PluginRequest, PropMethod, PropParamsByMethod } from '../index';
import { PROP_METHOD_FIELDS } from '../schemas';

/**
 * 属性引擎方法的「事实唯一性」守卫。
 *
 * 同一个 11 项名单在这份代码里曾有 4 份手抄写法(PropMethod 联合、
 * PropParamsByMethod 的键、PluginRequest 的联合成员、ui/plugin.ts 的 switch case)。
 * 少写给一份不会报错:`RequestParams<M>` 的条件链最后落在 ListFontsParams 兜底,
 * 于是漂移是静默的 —— 表现出来的症状是「工具描述里说能改的字段,调用时被判越界」。
 *
 * 这里用编译期断言(与 ui/code/*\/sync-guarantee.ts 同一 idiom)守住类型层面的三份,
 * 运行期只需盯住 PROP_METHOD_FIELDS —— 它已由各 `*Props` schema 的 Object.keys 派生。
 */

// ---- 编译期:三份类型级名单必须互为相等集合 ----

type Expect<T extends true> = T;
type StringKeys<T> = Extract<keyof T, string>;
type EqualSet<A extends string, B extends string> =
  Exclude<A, B> extends never
    ? Exclude<B, A> extends never
      ? true
      : false
    : false;

export const _propParamsCoverAllPropMethods: Expect<
  EqualSet<PropMethod, StringKeys<PropParamsByMethod>>
> = true;

export const _pluginRequestCoverAllPropMethods: Expect<
  EqualSet<PropMethod, Extract<PluginRequest['method'], PropMethod>>
> = true;

// ---- 运行期:归并此处即可,无需为编译期断言起三个名字 ----

const ALL_METHODS: readonly string[] = [
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

describe('属性方法名单', () => {
  it('PROP_METHOD_FIELDS 覆盖全部 PropMethod,且无多余键', () => {
    expect(Object.keys(PROP_METHOD_FIELDS).sort()).toEqual(
      [...ALL_METHODS].sort(),
    );
  });

  /**
   * 字段默认互斥 —— 唯一例外必须登记在这里。
   *
   * x/y 同时属于 move 与 resize 是**刻意**的(见 schemas/split-ops.ts 中
   * resizeNodeProps 的注释:尺寸与位置常一起改,拆两次调用中间态会被引擎改写),
   * 字段同源(都取自 transformPropsSchema),不是两套定义。
   *
   * ⚠ 仓库里「11 组字段零重叠(见 smoke-split 断言)」那句注释已经过时:
   * 重叠存在,而 smoke-split.ts 里根本没有这条断言 —— 所以很久没人发现。
   * 现在由本用例守:想再加共享字段就必须显式登记,不许悄悄重开
   * 「方法名即字段分组」这个前提的口子。
   */
  const SHARED_FIELDS: Record<string, readonly string[]> = {
    x: ['move', 'resize'],
    y: ['move', 'resize'],
  };

  it('11 组字段互斥 —— 共享字段必须显式登记在上表', () => {
    const owner = new Map<string, string[]>();
    for (const [method, fields] of Object.entries(PROP_METHOD_FIELDS)) {
      for (const f of fields) {
        owner.set(f, [...(owner.get(f) ?? []), method]);
      }
    }
    for (const [field, methods] of owner) {
      if (methods.length === 1) continue;
      expect(
        SHARED_FIELDS[field]?.slice().sort(),
        `字段 ${field} 被多个方法拥有:${methods.join(', ')};` +
          `不是刻意共享就说明字段分组已经串味了`,
      ).toEqual(methods.slice().sort());
    }
  });

  it('登记表本身诚实 —— 只为真实共享的字段登记,不许留空槽', () => {
    for (const field of Object.keys(SHARED_FIELDS)) {
      const owners = Object.entries(PROP_METHOD_FIELDS)
        .filter(([, fields]) => fields.includes(field))
        .map(([m]) => m);
      expect(
        owners.length,
        `${field} 已不再共享,把它从登记表删掉`,
      ).toBeGreaterThan(1);
    }
  });

  it('每个方法至少有一个字段 —— 空白名单会让该方法的任何调用都被判越界', () => {
    for (const [method, fields] of Object.entries(PROP_METHOD_FIELDS)) {
      expect(fields.length, `${method} 字段表为空`).toBeGreaterThan(0);
    }
  });
});
