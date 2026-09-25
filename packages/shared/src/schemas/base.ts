import { z } from 'zod';
import { BLEND_MODE_VALUES } from '../dicts/platform-value-domain';

// ---- 基础类型 (对齐 plugin-typings runtime) ----

/** 解析 #RGB/#RGBA/#RRGGBB/#RRGGBBAA 为 0-1 通道;非法格式返回 null */
export function parseHexColor(
  input: string,
): { r: number; g: number; b: number; a?: number } | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(input.trim());
  if (m == null) return null;
  let hex = m[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map((c) => c + c).join('');
  }
  const ch = (s: string): number => Number.parseInt(s, 16) / 255;
  const out: { r: number; g: number; b: number; a?: number } = {
    r: ch(hex.slice(0, 2)),
    g: ch(hex.slice(2, 4)),
    b: ch(hex.slice(4, 6)),
  };
  if (hex.length === 8) out.a = ch(hex.slice(6, 8));
  return out;
}

/** 颜色通道(0-1);引擎侧唯一形态,hex 由 core/normalize.ts 在引擎赋值前转换 */
export interface RGB {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/** 客户端可传的颜色:0-1 通道对象或 hex 字符串(#RGB/#RGBA/#RRGGBB/#RRGGBBAA) */
export type RGBInput = RGB | string;

const colorChannels = z
  .object({
    r: z
      .number()
      .min(0)
      .max(1, '颜色通道最大 1(0-255 的色值请先除以 255 归一化)')
      .describe('schema.base.r'),
    g: z
      .number()
      .min(0)
      .max(1, '颜色通道最大 1(0-255 的色值请先除以 255 归一化)')
      .describe('schema.base.g'),
    b: z
      .number()
      .min(0)
      .max(1, '颜色通道最大 1(0-255 的色值请先除以 255 归一化)')
      .describe('schema.base.b'),
    a: z
      .number()
      .min(0)
      .max(1, 'alpha 通道最大 1(0-255 请先归一化)')
      .optional()
      .describe('schema.base.a'),
  })
  .strict();

// 颜色 = 通道对象(0-1)或 hex 字符串。只做校验不做 transform:hex→通道的
// 归一化在 core/normalize.ts 引擎赋值前统一完成(schema 带 transform 时
// z.toJSONSchema 直接抛 "Transforms cannot be represented in JSON Schema")。
// 不用 union:union 失败时 zod 只报笼统的 "Invalid input",这里手动分发校验,
// 对象输入透出通道级精确报错(如 0-255 归一化提示),字符串输入给出 hex 格式提示。
const COLOR_TYPE_HINT =
  '颜色需为 {r,g,b[,a]} 对象(通道 0-1,0-255 色值请先除以 255)或 hex 字符串(#RGB/#RGBA/#RRGGBB/#RRGGBBAA,如 "#ff0000")';

// 单段 as:入参类型是客户端形态 RGBInput,输出类型是归一化后的通道对象
// (core/normalize.ts 产出),两侧语义各自成立
const colorSchema = z.unknown().superRefine((v, ctx) => {
  if (typeof v === 'string') {
    if (parseHexColor(v) == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `无效 hex 颜色 "${v}"(${COLOR_TYPE_HINT})`,
      });
    }
    return;
  }
  const r = colorChannels.safeParse(v);
  if (!r.success) {
    for (const issue of r.error.issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: issue.path,
        message: issue.message,
      });
    }
  }
}) as z.ZodType<RGB, RGBInput>;

export const rgbSchema = colorSchema.describe(
  '颜色:{r,g,b} 对象(通道 0-1)或 hex 字符串,如 "#ff0000"(带透明度可用 8 位 hex,其 alpha 会转为 paint 级 opacity)',
);

export const rgbaSchema = colorSchema.describe(
  'RGBA 颜色:{r,g,b,a} 对象(通道 0-1,a 缺省按 1)或 hex 字符串,如 "#ff0000"、"#ff000080"',
);
export type RGBA = RGB;

export const gradientStopSchema = z
  .object({
    color: rgbaSchema.describe('schema.base.color'),
    position: z.number().min(0).max(1).describe('schema.base.position'),
  })
  .describe(
    '渐变停止点,如 {color:{r:1,g:0,b:0,a:1}, position:0}(起点红色)和 {color:{r:0,g:0,b:1,a:1}, position:1}(终点蓝色)',
  );
export type GradientStop = z.infer<typeof gradientStopSchema>;

/**
 * 变换矩阵。**不要改回 `z.tuple`**：
 * SDK 固定按 draft-2020-12 生成 JSON Schema，tuple 会编译成
 * `{prefixItems:[...], items:false}`；而 MCP 客户端（@modelcontextprotocol/sdk
 * 的 AjvJsonSchemaValidator，见 validation/ajv-provider.js）用的是 **classic
 * draft-07 Ajv**，它不认 `prefixItems`，于是 `items:false` 被理解成
 * 「数组必须为空」→ 任何渐变填充的 gradientTransform 都必然校验失败
 * （报 "Structured content does not match the tool's output schema"）。
 * 纯嵌套数组 + length() 只产出 minItems/maxItems，两个 draft 下语义一致。
 */
export const transformSchema = z
  .array(z.array(z.number()).length(3))
  .length(2)
  .describe('schema.base.transformSchema');
export type Transform = z.infer<typeof transformSchema>;

// 混合模式 (对齐 runtime BlendMode)
// 取值表在 dicts/platform-value-domain.ts —— 那里要拿它算「本平台接受什么」
// (契约候选 − 平台收窄),故真源放 dicts(AGENTS.md 的字典归位约定),这里只引用。
export const blendModeSchema = z
  .enum(BLEND_MODE_VALUES)
  .describe(
    '混合模式:PASS_THROUGH=穿透 | NORMAL=正常 | DARKEN=变暗 | MULTIPLY=正片叠底 | COLOR_BURN=颜色加深 | LIGHTEN=变亮 | SCREEN=滤色 | COLOR_DODGE=颜色减淡 | OVERLAY=叠加 | SOFT_LIGHT=柔光 | HARD_LIGHT=强光 | DIFFERENCE=差值 | EXCLUSION=排除 | HUE=色相 | SATURATION=饱和度 | COLOR=颜色 | LUMINOSITY=明度',
  );
export type BlendMode = z.infer<typeof blendModeSchema>;

// Paint: 填充/描边的统一表示 (对齐 runtime Paint union)
export const paintSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('SOLID').describe('schema.base.type'),
      color: rgbSchema.describe(
        '纯色值,支持 {r,g,b} 对象(通道 0-1)或 hex 字符串,如 "#ff0000"',
      ),
      opacity: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('schema.base.opacity'),
      visible: z.boolean().optional().describe('schema.base.visible'),
      blendMode: blendModeSchema.optional().describe('schema.base.blendMode'),
    })
    .strict()
    .describe('schema.base.blendMode2'),
  z
    .object({
      type: z.literal('GRADIENT_LINEAR').describe('schema.base.type2'),
      gradientStops: z
        .array(gradientStopSchema)
        .describe('schema.base.gradientStops'),
      gradientTransform: transformSchema,
    })
    .strict()
    .describe('schema.base.gradientTransform'),
  z
    .object({
      type: z.literal('GRADIENT_RADIAL').describe('schema.base.type3'),
      gradientStops: z
        .array(gradientStopSchema)
        .describe('schema.base.gradientStops2'),
      gradientTransform: transformSchema,
    })
    .strict()
    .describe('schema.base.gradientTransform2'),
  z
    .object({
      type: z.literal('GRADIENT_ANGULAR').describe('schema.base.type4'),
      gradientStops: z
        .array(gradientStopSchema)
        .describe('schema.base.gradientStops3'),
      gradientTransform: transformSchema,
    })
    .strict()
    .describe('schema.base.gradientTransform3'),
  z
    .object({
      type: z.literal('IMAGE').describe('schema.base.type5'),
      imageHash: z.string().describe('schema.base.imageHash'),
      scaleMode: z
        .enum(['FILL', 'FIT', 'CROP', 'TILE'])
        .optional()
        .describe('schema.base.scaleMode'),
    })
    .strict()
    .describe('schema.base.scaleMode2'),
]);
export type Paint = z.infer<typeof paintSchema>;

// 效果 (对齐 runtime Effect discriminated union)
export const effectSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('DROP_SHADOW').describe('schema.base.type6'),
      color: rgbaSchema.describe('schema.base.color2'),
      offset: z
        .object({
          x: z.number().describe('schema.base.x'),
          y: z.number().describe('schema.base.y'),
        })
        .describe('schema.base.y2'),
      radius: z.number().min(0).describe('schema.base.radius'),
      spread: z.number().optional().describe('schema.base.spread'),
      visible: z.boolean().optional().describe('schema.base.visible2'),
      blendMode: blendModeSchema
        .default('NORMAL')
        .describe('schema.base.blendMode3'),
      showShadowBehindNode: z
        .boolean()
        .optional()
        .describe('schema.base.showShadowBehindNode'),
    })
    .strict()
    .describe('schema.base.showShadowBehindNode2'),
  z
    .object({
      type: z.literal('INNER_SHADOW').describe('schema.base.type7'),
      color: rgbaSchema.describe('schema.base.color3'),
      offset: z
        .object({
          x: z.number().describe('schema.base.x2'),
          y: z.number().describe('schema.base.y3'),
        })
        .describe('schema.base.y4'),
      radius: z.number().min(0).describe('schema.base.radius2'),
      spread: z.number().optional().describe('schema.base.spread2'),
      visible: z.boolean().optional().describe('schema.base.visible3'),
      blendMode: blendModeSchema
        .default('NORMAL')
        .describe('schema.base.blendMode4'),
    })
    .strict()
    .describe('schema.base.blendMode5'),
  z
    .object({
      type: z.literal('LAYER_BLUR').describe('schema.base.type8'),
      radius: z.number().min(0).describe('schema.base.radius3'),
      visible: z.boolean().optional().describe('schema.base.visible4'),
    })
    .strict()
    .describe('schema.base.visible5'),
  z
    .object({
      type: z.literal('BACKGROUND_BLUR').describe('schema.base.type9'),
      radius: z.number().min(0).describe('schema.base.radius4'),
      visible: z.boolean().optional().describe('schema.base.visible6'),
    })
    .strict()
    .describe('schema.base.visible7'),
]);
export type Effect = z.infer<typeof effectSchema>;

// 约束 (对齐 runtime Constraints)
export const constraintTypeSchema = z
  .enum(['MIN', 'MAX', 'STRETCH', 'CENTER', 'SCALE'])
  .describe(
    '约束类型:MIN=吸附左/上 | MAX=吸附右/下 | STRETCH=拉伸 | CENTER=居中 | SCALE=等比缩放',
  );
export type ConstraintType = z.infer<typeof constraintTypeSchema>;

// 布局网格 (对齐 runtime LayoutGrid)
export interface LayoutGrid {
  pattern: 'ROWS' | 'COLUMNS' | 'GRID';
  alignment?: 'MIN' | 'MAX' | 'CENTER' | 'STRETCH';
  sectionSize?: number;
  count?: number;
  gutterSize?: number;
  offset?: number;
  visible?: boolean;
  color?: RGBA;
}

export const layoutGridSchema: z.ZodType<LayoutGrid> = z
  .object({
    pattern: z
      .enum(['ROWS', 'COLUMNS', 'GRID'])
      .describe('schema.base.pattern'),
    alignment: z
      .enum(['MIN', 'MAX', 'CENTER', 'STRETCH'])
      .optional()
      .describe('schema.base.alignment'),
    sectionSize: z.number().optional().describe('schema.base.sectionSize'),
    count: z.number().int().positive().optional(),
    gutterSize: z.number().optional().describe('schema.base.gutterSize'),
    offset: z.number().optional().describe('schema.base.offset'),
    visible: z.boolean().optional(),
    color: rgbaSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.pattern === 'GRID' && val.sectionSize == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pattern 为 GRID 时,sectionSize 为必填项',
        path: ['sectionSize'],
      });
    }
    // ROWS / COLUMNS 对应三平台 typings 里同形的 RowsColsLayoutGrid —— 其
    // `count` / `gutterSize` 三平台**都**是必填(Figma 无 `?`)。缺了引擎会丢掉
    // 整条网格且不报错,故在边界就拦下,不让它变成「回显成功、画布没变」。
    // `alignment` 同为必填但有公认默认(左/上),由 core/normalize 补 MIN,不在此拦。
    if (val.pattern === 'ROWS' || val.pattern === 'COLUMNS') {
      for (const key of ['count', 'gutterSize'] as const) {
        if (val[key] == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `pattern 为 ${val.pattern} 时,${key} 为必填项(三平台的 RowsColsLayoutGrid 都把它列为必填)`,
            path: [key],
          });
        }
      }
    }
  });

// 矢量路径 (对齐 runtime VectorPath)
export interface VectorPath {
  data: string;
  windingRule?: 'NONZERO' | 'EVENODD' | 'NONE';
}

export const vectorPathSchema: z.ZodType<VectorPath> = z.object({
  data: z
    .string()
    .describe(
      'SVG path data,如 "M0 0 L100 0 L100 100 Z"(M=移动到,L=画线到,Z=闭合)。仅支持 M/L/Q/C/Z 指令(SVG 子集,不支持 A 圆弧等);完整 SVG 请改用 jsd_create_svg',
    ),
  windingRule: z
    .enum(['NONZERO', 'EVENODD', 'NONE'])
    .default('NONZERO')
    .describe('schema.base.windingRule'),
});

// 字体 (对齐 runtime FontName)
export const fontNameSchema = z.object({
  family: z
    .string()
    .describe(
      '字体族:用 jsd_list_fonts 的 fonts[].family 原样值,如 "SourceHanSansCN_family"(带 _family 后缀是平台列表的原始名)',
    ),
  style: z
    .string()
    .describe(
      '字型:必须是同一 family 的 fonts[].styles 里的**全名**,如 "SourceHanSansCN-Bold"(不是简称 "Bold")。写错不会报错,会静默退回默认字面(命中时结果 warnings 点名)',
    ),
});
export type FontName = z.infer<typeof fontNameSchema>;

// 行高 (对齐 runtime LineHeight)
export type LineHeight =
  | { value: number; unit: 'PIXELS' }
  | { value: number; unit: 'PERCENT' }
  | { unit: 'AUTO' };

export const lineHeightSchema: z.ZodType<LineHeight> = z.union([
  z
    .object({
      value: z.number().describe('schema.base.value'),
      unit: z.literal('PIXELS').describe('schema.base.unit'),
    })
    .describe(
      '固定行高:{value: 数值, unit: "PIXELS"},如 {value: 24, unit: "PIXELS"}',
    ),
  z
    .object({
      value: z.number().describe('schema.base.value2'),
      unit: z.literal('PERCENT').describe('schema.base.unit2'),
    })
    .describe(
      '百分比行高:{value: 数值, unit: "PERCENT"},如 {value: 150, unit: "PERCENT"}',
    ),
  z
    .object({ unit: z.literal('AUTO').describe('schema.base.unit3') })
    .describe('schema.base.unit4'),
]);

// 字距 (对齐 runtime LetterSpacing)
export interface LetterSpacing {
  value: number;
  unit: 'PIXELS' | 'PERCENT';
}

export const letterSpacingSchema: z.ZodType<LetterSpacing> = z.object({
  value: z.number(),
  unit: z.enum(['PIXELS', 'PERCENT']).describe('schema.base.unit5'),
});
