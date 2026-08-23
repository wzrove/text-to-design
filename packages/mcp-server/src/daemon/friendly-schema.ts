import { fromJsonSchema } from '@modelcontextprotocol/server';

/**
 * 入参校验失败的「人话」改写层。
 *
 * 背景:daemon 经 fromJsonSchema(JSON Schema→ajv) 复刻上游工具的 inputSchema,
 * 对 oneOf/anyOf 型工具(如 jsd_manage_nodes 按 op 分发的 9 分支联合),空参或不完整
 * 入参会让所有分支同时失配,ajv 把每条分支的缺失字段平铺成一条超长报错
 * (形如 "data must have required property 'op', …" 重复 N 遍),
 * 既不回显实际入参,也不说明分支互斥关系 —— 调用方(尤其 LLM)极易误诊为传输丢参。
 *
 * 本包装不改变校验结果(valid 才放行),仅在校验失败时把单条 issue 改写为:
 * 「收到字段 X/Y/Z + 按 op 分发的合法取值与各分支必填项 + 截断后的原始校验细节」。
 */

/** 本实现用到的 JSON Schema 子集(只需读取联合分支的判别信息) */
interface JsonSchemaSubset {
  oneOf?: unknown;
  anyOf?: unknown;
  properties?: unknown;
  required?: unknown;
}

/** Standard Schema v1 校验结果(同步路径) */
type ValidateResult =
  | { value: unknown }
  | { issues: ReadonlyArray<{ message?: unknown }> };

/** fromJsonSchema 返回的 ~standard 面(只声明我们要触碰的字段) */
interface StandardFace {
  version: number;
  vendor: string;
  jsonSchema?: unknown;
  validate: (value: unknown) => ValidateResult;
}

/** 从单个分支的 properties 中找判别字面量(op 的 const/enum[0]) */
function branchDiscriminator(branch: JsonSchemaSubset): string | null {
  const props = branch.properties as
    | Record<string, { const?: unknown; enum?: readonly unknown[] }>
    | undefined;
  if (props == null || typeof props !== 'object') return null;
  for (const schema of Object.values(props)) {
    if (schema == null || typeof schema !== 'object') continue;
    if ('const' in schema && schema.const != null) return String(schema.const);
    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      return String(schema.enum[0]);
    }
  }
  return null;
}

/**
 * 把联合 schema 的各分支压成一行清单:
 * "select(需 ids) | remove(需 ids) | repair(无必填)"。
 * 非联合 schema 或解析不出分支时返回 null,由上层退回原始报错。
 */
export function describeUnionBranches(schema: JsonSchemaSubset): string | null {
  const branches = [schema.oneOf, schema.anyOf].find(
    (v): v is unknown[] => Array.isArray(v) && v.length > 0,
  );
  if (branches == null) return null;
  return branches
    .map((raw, i) => {
      const branch = (raw ?? {}) as JsonSchemaSubset;
      const label = branchDiscriminator(branch) ?? `分支#${i}`;
      const required = Array.isArray(branch.required)
        ? branch.required.filter((k) => k !== 'op')
        : [];
      return required.length > 0
        ? `${label}(需 ${required.join(', ')})`
        : `${label}(无必填)`;
    })
    .join(' | ');
}

/** 尽量读出入参顶层字段名,便于回显"到底发了什么" */
function receivedKeys(value: unknown): string {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value) ?? String(value);
  }
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length > 0 ? `字段 [${keys.join(', ')}]` : '空对象 {}';
}

/** 包装 fromJsonSchema 的产物:校验行为不变,失败信息改写为人话 */
export function friendlyInputSchema(
  schema: Parameters<typeof fromJsonSchema>[0],
): ReturnType<typeof fromJsonSchema> {
  const converted = fromJsonSchema(schema);
  const face = converted['~standard'] as unknown as StandardFace;
  const branchHint = describeUnionBranches(schema as JsonSchemaSubset);

  const wrapped: StandardFace = {
    ...face,
    validate(value: unknown): ValidateResult {
      const result = face.validate(value);
      if (!('issues' in result)) return result;

      let knownOp = '';
      if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        const op = (value as Record<string, unknown>).op;
        if (typeof op === 'string') knownOp = `, op='${op}'`;
      }
      const detail = result.issues
        .map((issue) =>
          typeof issue?.message === 'string' ? issue.message : '',
        )
        .filter(Boolean)
        .join('; ')
        .slice(0, 300);
      const hint =
        branchHint != null
          ? `该工具按判别字段分发,可选值: ${branchHint}。`
          : '';
      return {
        issues: [
          {
            message: `入参校验失败: 实际收到${receivedKeys(value)}${knownOp}。${hint}请补齐对应必填字段后重试。原始校验: ${detail}`,
          },
        ],
      };
    },
  };

  // jsonSchema 面必须原样保留:SDK 在 tools/list 与 SEP-2243 预检时会用它还原线格式
  return {
    '~standard': wrapped,
  } as unknown as ReturnType<typeof fromJsonSchema>;
}
