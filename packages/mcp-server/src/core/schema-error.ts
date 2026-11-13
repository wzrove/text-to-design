import type { z } from 'zod';

/** 越界字段点名上限(超过就只说个数,不做无限铺表) */
export const UNEXPECTED_KEY_LIMIT = 8;
/** 允许键名超过这个数就不列全表(jsd_create_frame 有 46 个),只给数量 */
export const ALLOWED_KEY_LIST_LIMIT = 20;

/**
 * 从 zod object 根 schema 取允许的顶层键名。联合 schema(jsd_manage_nodes 这类按 op
 * 分发)与非 object 根返回 null,由调用方退回原始报错 —— 猜错的键名清单比不写更糟。
 */
export function allowedTopKeys(schema: z.ZodType): string[] | null {
  const shape = (schema as { shape?: unknown }).shape;
  if (shape == null || typeof shape !== 'object') return null;
  const keys = Object.keys(shape as Record<string, unknown>);
  return keys.length > 0 ? keys : null;
}

/** 入参里的顶层键名;非 object / 数组返回 null(不是「空对象」—— 无从点名) */
export function receivedTopKeys(args: unknown): Record<string, unknown> | null {
  if (args == null || typeof args !== 'object' || Array.isArray(args)) {
    return null;
  }
  return args as Record<string, unknown>;
}

/**
 * schema 允许集之外的入参顶层键。
 *
 * 两套方言都能给出「允许集」,但取得方式不同:zod 取根 shape 的键,线格式取
 * properties 的键(且联合 schema 给不出) —— 这里只收已判定可用的那份键表。
 */
export function unexpectedTopKeys(
  received: readonly string[],
  allowed: readonly string[],
): string[] {
  const allow = new Set(allowed);
  return received.filter((k) => !allow.has(k));
}

/**
 * 越界字段点名的**唯一措辞**(两套 schema 方言共用:zod 出口与线格式 JSON Schema 出口)。
 *
 * 背景:调用方(尤其 LLM)看到一句 `Unrecognized key: "type"` 会整份入参重写一遍,
 * 而不是删掉那一个字段 —— 一次会话内同一份坏载荷因此连试 5 次(0034)。
 * 合并留在这里而不是放在任一出口:它既不属于 core 工具出口,也不属于 daemon shim 入口,
 * 只是「字段集 → 人话」的纯转换。
 */
export function unexpectedKeysMessage(
  unexpected: readonly string[],
  allowed: readonly string[],
  received: readonly string[],
  detail: string,
): string {
  const named = unexpected.slice(0, UNEXPECTED_KEY_LIMIT).join(', ');
  const more =
    unexpected.length > UNEXPECTED_KEY_LIMIT
      ? ` 等 ${unexpected.length} 个`
      : '';
  const list =
    allowed.length <= ALLOWED_KEY_LIST_LIMIT
      ? `该工具接受: [${allowed.join(', ')}]。`
      : `该工具接受 ${allowed.length} 个字段(完整清单见其 schema),本次收到的 [${received.join(', ')}] 里只有上述字段越界。`;
  return `字段 [${named}]${more} 不被该工具接受,请删掉后重试(其余字段本身合法)。${list}原始校验: ${detail}`;
}

/**
 * 入参校验失败的「人话」改写(zod 输入源)。
 *
 * 调 tools/call 的常规路径已由 SDK 的 validateToolInput 拦下,但 **jsd_batch 直调内层
 * 工具**会绕过它,此时 strict schema 拒字段只给一句 `(root): Unrecognized key: "type"`。
 * 只在能确定越界字段时改写;否则原样返回原始 detail(缺必填字段等场景保持原状)。
 */
export function describeInvalidArgs(
  inputSchema: z.ZodType,
  args: unknown,
  detail: string,
): string {
  const keys = allowedTopKeys(inputSchema);
  const received = receivedTopKeys(args);
  if (keys == null || received == null) return detail;
  const names = Object.keys(received);
  const unexpected = unexpectedTopKeys(names, keys);
  if (unexpected.length === 0) return detail;
  return unexpectedKeysMessage(unexpected, keys, names, detail);
}
