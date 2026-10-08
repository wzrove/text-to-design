import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { promptArgsSchema } from '../daemon/proxy';

/**
 * shim 镜像 prompt 参数声明的不变式。
 *
 * 为什么守它:镜像里丢掉 `required` 会让**下游不填就调不动** —— 而本仓的配方 prompt
 * 恰恰靠「参数留空 = 只要纪律」(见 0032 的 9 个配方:`design-strategy` 的 `screen`、
 * `variant-set` 的 `family`、`component-property` 的 `target` 全是可选)。
 * 症状不报错、只表现为「客户端里点一个 prompt 就弹参数校验失败」,没人会为此开 bug ——
 * 2026-09-29 真机复验时就撞上了(`screen: expected string, received undefined`)。
 */

/** 用 JSON Schema 看「哪些字段算必填」——与下游从 prompts/list 读到的信息同源 */
function requiredFields(schema: z.ZodType): string[] {
  const json = z.toJSONSchema(schema, { io: 'input' }) as {
    required?: string[];
  };
  return json.required ?? [];
}

describe('promptArgsSchema', () => {
  it('可选参数在镜像后仍然是可选(不填能过)', async () => {
    const schema = promptArgsSchema([
      { name: 'screen', description: '界面名', required: false },
    ]);
    expect(requiredFields(schema)).toEqual([]);
    const parsed = await schema['~standard'].validate({});
    expect(parsed.issues ?? []).toEqual([]);
  });

  it('必填参数在镜像后仍然必填(不填要被拦住)', async () => {
    const schema = promptArgsSchema([
      { name: 'html', description: 'HTML 片段', required: true },
    ]);
    expect(requiredFields(schema)).toEqual(['html']);
    const parsed = await schema['~standard'].validate({});
    expect(parsed.issues?.length ?? 0).toBeGreaterThan(0);
  });

  it('同一 prompt 里必填与可选混着也要各归各位', async () => {
    const schema = promptArgsSchema([
      { name: 'icons', description: '图标名', required: true },
      { name: 'size', description: '边长', required: false },
      { name: 'gap' },
    ]);
    // `required` 缺省的参数按可选处理:上游没说必填,就不该在下游替它加码
    expect(requiredFields(schema)).toEqual(['icons']);
    const parsed = await schema['~standard'].validate({ icons: 'house' });
    expect(parsed.issues ?? []).toEqual([]);
  });

  it('没有参数声明时是空 schema(不写 required)', () => {
    expect(requiredFields(promptArgsSchema(undefined))).toEqual([]);
    expect(requiredFields(promptArgsSchema([]))).toEqual([]);
  });

  it('字段说明照抄上游(客户端靠它提示该填什么)', () => {
    const schema = promptArgsSchema([
      {
        name: 'screen',
        description: '要设计的界面名称,如「登录页」',
        required: false,
      },
    ]);
    const json = z.toJSONSchema(schema, { io: 'input' }) as {
      properties?: Record<string, { description?: string }>;
    };
    expect(json.properties?.screen?.description).toBe(
      '要设计的界面名称,如「登录页」',
    );
  });
});
