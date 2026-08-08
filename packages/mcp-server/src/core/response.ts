import type { z } from 'zod';

function text(content: unknown): { content: { type: 'text'; text: string }[] } {
  return {
    content: [
      {
        type: 'text',
        text:
          typeof content === 'string'
            ? content
            : JSON.stringify(content, null, 2),
      },
    ],
  };
}

type AnyZod = z.ZodTypeAny;
type LooseDef = {
  typeName?: string;
  value?: unknown;
  values?: unknown[];
  innerType?: AnyZod;
  schema?: AnyZod;
  options?: AnyZod[];
  getter?: () => AnyZod;
};
function typeName(schema: AnyZod): string | undefined {
  return (schema as unknown as { _def?: LooseDef })._def?.typeName;
}
function innerOf(
  schema: AnyZod,
  key: 'innerType' | 'schema',
): AnyZod | undefined {
  return (schema as unknown as { _def?: LooseDef })._def?.[key];
}
// biome-ignore lint/suspicious/noShadowRestrictedNames: 工具函数名 valueOf 与 Object.prototype 无关
function valueOf(schema: AnyZod, key: 'value' | 'values' | 'options'): unknown {
  return (schema as unknown as { _def?: LooseDef })._def?.[key];
}

/** 从 zod schema 推导"空形状",保证失败/畸形结果也能通过 outputSchema 校验 */
function emptyFor(schema: AnyZod): unknown {
  switch (typeName(schema)) {
    case 'ZodObject': {
      const shapeFn = (
        schema as unknown as { shape?: () => Record<string, AnyZod> }
      ).shape;
      if (typeof shapeFn !== 'function') return undefined;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(shapeFn())) out[k] = emptyFor(v);
      return out;
    }
    case 'ZodArray':
      return [];
    case 'ZodBoolean':
      return false;
    case 'ZodNumber':
      return 0;
    case 'ZodString':
      return '';
    case 'ZodLiteral':
      return valueOf(schema, 'value');
    case 'ZodEnum':
      return (valueOf(schema, 'values') as unknown[] | undefined)?.[0];
    case 'ZodOptional':
    case 'ZodDefault': {
      const inner = innerOf(schema, 'innerType');
      return inner ? emptyFor(inner) : undefined;
    }
    case 'ZodEffects': {
      const inner = innerOf(schema, 'schema');
      return inner ? emptyFor(inner) : undefined;
    }
    case 'ZodUnion': {
      const opts = (valueOf(schema, 'options') as AnyZod[] | undefined) ?? [];
      // 若分支含数组类型(如 created:单节点|数组),优先取数组,空数组最稳妥
      const arr = opts.find((o) => typeName(o) === 'ZodArray');
      return arr ? emptyFor(arr) : opts[0] ? emptyFor(opts[0]) : undefined;
    }
    case 'ZodLazy': {
      const getter = (schema as unknown as { _def?: LooseDef })._def?.getter;
      return getter ? emptyFor(getter()) : undefined;
    }
    default:
      return undefined;
  }
}

/** 错误返回:人读文本 + schema-valid 结构化空结果 + isError,避免"no structured content" */
export function err(
  e: unknown,
  schema?: z.ZodType,
): {
  content: { type: 'text'; text: string }[];
  structuredContent?: unknown;
  isError: true;
} {
  const base: {
    content: { type: 'text'; text: string }[];
    isError: true;
  } = {
    content: [
      {
        type: 'text',
        text: `错误: ${e instanceof Error ? e.message : String(e)}`,
      },
    ],
    isError: true,
  };
  return schema ? { ...base, structuredContent: emptyFor(schema) } : base;
}

/** 返回类型:人读文本 + 结构化数据(与 outputSchema 对应) */
export function structured(
  data: unknown,
  schema?: z.ZodType,
): {
  content: { type: 'text'; text: string }[];
  structuredContent: unknown;
  isError?: true;
} {
  if (schema) {
    const parsed = schema.safeParse(data);
    if (parsed.success) {
      return { content: text(data).content, structuredContent: parsed.data };
    }
    // 插件返回异常数据(过不了 schema)时仍兜底返回合法空结构
    return {
      content: text(data).content,
      structuredContent: emptyFor(schema),
      isError: true,
    };
  }
  return { content: text(data).content, structuredContent: data };
}
