import type { ErrorCode } from 'text-to-design-shared';
import type { z } from 'zod';
import { errorCodeOf } from './bridge-error';

/**
 * 工具结果的 followUp 引导(参照 server.ts 参考实现,MCP 协议结果字段):
 * 指向推荐的下一个 prompt 或下一个 tool,结果带该字段即提示调用方继续哪一步。
 * 定义在本模块里而不是工具定义模块:它是**结果协议**的一部分(与 structured/err 同源),
 * 放工具定义处会让 response ↔ 工具定义成环。
 */
export type FollowUp =
  | { type: 'prompt'; prompt: string }
  | { type: 'tool'; tool: string; description?: string };

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

/**
 * 错误类别 → 下一步引导。这里是该类文案的**唯一真源**:插件/传输层只报 code,
 * 不再各自往 message 里拼「下一步怎么办」。
 */
const ERROR_FOLLOW_UP: Partial<Record<ErrorCode, FollowUp>> = {
  not_connected: {
    type: 'prompt',
    prompt:
      '在当前设计客户端里运行 text-to-design 插件,并确认面板显示「已连接」后重试。',
  },
};

/**
 * 错误返回:人读文本 + schema-valid 结构化空结果 + isError,避免"no structured content"。
 *
 * `code` 是给人读之外的第二通道:调用方(jsd_batch)要按**类别**分类失败,
 * 此前只能对文本做 slice(0,300) 猜 —— 文本是给人看的,分类不该从它反推。
 */
export function err(
  e: unknown,
  schema?: z.ZodType,
  followUp?: FollowUp,
): {
  content: { type: 'text'; text: string }[];
  structuredContent?: unknown;
  isError: true;
  followUp?: FollowUp;
  code: ErrorCode;
} {
  const code = errorCodeOf(e);
  const resolvedFollowUp = ERROR_FOLLOW_UP[code] ?? followUp;
  const base: {
    content: { type: 'text'; text: string }[];
    isError: true;
    followUp?: FollowUp;
    code: ErrorCode;
  } = {
    content: [
      {
        type: 'text',
        text: `错误: ${e instanceof Error ? e.message : String(e)}`,
      },
    ],
    isError: true,
    code,
  };
  if (resolvedFollowUp !== undefined) base.followUp = resolvedFollowUp;
  return schema ? { ...base, structuredContent: emptyFor(schema) } : base;
}

/** 返回类型:人读文本 + 结构化数据(与 outputSchema 对应)。
 *  extra 为成功时的附加文本块(置于 JSON 文本之前),用于进度/汇总/逐条失败提示,
 *  与参考实现(set_multiple_text_contents 多段 content)对齐。
 *  followUp 为工具结果的下一步引导(MCP 协议结果字段),有则注入结果。 */
export function structured(
  data: unknown,
  schema?: z.ZodType,
  extra?: { type: 'text'; text: string }[],
  followUp?: FollowUp,
): {
  content: { type: 'text'; text: string }[];
  structuredContent: unknown;
  isError?: true;
  followUp?: FollowUp;
} {
  if (schema) {
    const parsed = schema.safeParse(data);
    if (parsed.success) {
      return {
        content: [...(extra ?? []), ...text(data).content],
        structuredContent: parsed.data,
        ...(followUp !== undefined ? { followUp } : {}),
      };
    }
    // 插件返回的数据过不了 schema:把**哪一项不合形状**说在前面,再附原始正文。
    // 此前只回原始 JSON 并标 isError —— 调用方(和 jsd_batch 的失败文案)看到的
    // 「错误」就是一段正常数据,真实原因(校验失败)反而没有任何出口。
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .slice(0, 8)
      .join('; ');
    return {
      content: [
        {
          type: 'text',
          text: `错误: 结果未通过本工具的输出校验 —— ${detail}\n原始返回:\n${JSON.stringify(data, null, 2)}`,
        },
      ],
      structuredContent: emptyFor(schema),
      isError: true,
      ...(followUp !== undefined ? { followUp } : {}),
    };
  }
  return {
    content: [...(extra ?? []), ...text(data).content],
    structuredContent: data,
    ...(followUp !== undefined ? { followUp } : {}),
  };
}
