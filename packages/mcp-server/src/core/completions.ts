import { completable } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { recipeIds } from '../tools/recipe-catalog';

/**
 * 参数自动补全(MCP `completion`):客户端在填参数时直接给候选,
 * 而不是让调用方凭记忆拼 id。
 *
 * ## 为什么补全面只有两处
 *
 * 协议里 `completion/complete` 的引用面只有 **prompt 参数** 与 **resource template 变量**,
 * 工具入参不在其内。所以能补的正好是:
 * - `jsd://recipes/{id}` 的模板变量
 * - 各配方 prompt 里那些「取值集合固定」的参数
 *
 * ## 补全不许碰插件
 *
 * 用户每敲一个字符客户端都会问一次,这里全部是**纯本地**计算(只读内存常量),
 * 不触发桥接往返。为给候选去读画布(例如列节点 id)会让每次按键变成一次
 * 插件 RTT,输入框会卡。
 */

/** 统一形态:空串给全量,否则按子串过滤,再截断 */
const match = (all: readonly string[], value: string, cap = 20): string[] => {
  const v = value.trim().toLowerCase();
  const hit = v === '' ? all : all.filter((x) => x.toLowerCase().includes(v));
  return hit.slice(0, cap);
};

export function completeRecipeIds(value: string): string[] {
  return match(recipeIds(), value);
}

/**
 * 给任意取值为固定集合的字符串参数加补全。
 *
 * `candidates` 是惰性函数而不是数组:候选可能依赖配方目录,而这个工厂在**注册期**
 * 就被求值 —— 惰性写法让新增配方不必重装配。
 *
 * ⚠ 包法有方向:`completable` 必须包在**参数类型本身**上,`.optional()` 落在更外层。
 * SDK 处理 `completion/complete` 时先 `unwrapOptionalSchema`(剥掉一层 optional),
 * 再取 shape、再判 `isCompletable`。把 completable 裹进 optional 里(即
 * `completable(z.string().optional())`)时剥出来的内层不带补全符号 ——
 * 客户端永远收到空候选,而且不报错。实测踩过,见 sdk-features 回归测试。
 */
export function completableArg<T extends z.ZodType>(
  schema: T,
  candidates: () => readonly string[],
): T {
  return completable(schema, (value: unknown) =>
    match(candidates(), typeof value === 'string' ? value : ''),
  ) as T;
}

/** 同上,但把结果包成 optional —— 外层 optional、内层带补全,方向不能反 */
export function optionalCompletableArg<T extends z.ZodType>(
  schema: T,
  candidates: () => readonly string[],
): z.ZodOptional<T> {
  return completableArg(schema, candidates).optional();
}

/** 配方相关参数的补全:候选恒为配方 id */
export function recipeIdArg<T extends z.ZodType>(schema: T): T {
  return completableArg(schema, recipeIds);
}

/**
 * 节点类型候选(= MCP 的节点类型枚举)。`variant-sync` 的 targetType 之类
 * 参数取值必落在这个集合里,给出下拉比让人背名字可靠。
 */
export const NODE_TYPE_CANDIDATES: readonly string[] = [
  'FRAME',
  'GROUP',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'RECTANGLE',
  'ELLIPSE',
  'POLYGON',
  'STAR',
  'LINE',
  'VECTOR',
  'TEXT',
  'BOOLEAN_OPERATION',
  'SLICE',
];
