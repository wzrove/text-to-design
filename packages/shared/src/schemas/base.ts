import { z } from 'zod';

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

const colorChannels = z
  .object({
    r: z
      .number()
      .min(0)
      .max(1, '颜色通道最大 1(0-255 的色值请先除以 255 归一化)')
      .describe('红色通道,范围 0-1(0=无,1=满),如纯红为 1'),
    g: z
      .number()
      .min(0)
      .max(1, '颜色通道最大 1(0-255 的色值请先除以 255 归一化)')
      .describe('绿色通道,范围 0-1'),
    b: z
      .number()
      .min(0)
      .max(1, '颜色通道最大 1(0-255 的色值请先除以 255 归一化)')
      .describe('蓝色通道,范围 0-1'),
    a: z
      .number()
      .min(0)
      .max(1, 'alpha 通道最大 1(0-255 请先归一化)')
      .optional()
      .describe('不透明度,范围 0-1(0=全透明,1=不透明),缺省按 1 处理'),
  })
  .strict();

// 颜色 = 通道对象(0-1)或 hex 字符串;hex 在 parse 阶段即转为通道对象,
// 引擎/序列化层永远只看到 {r,g,b[,a]}。
// 不用 union:union 失败时 zod 只报笼统的 "Invalid input",这里手动分发校验,
// 对象输入透出通道级精确报错(如 0-255 归一化提示),字符串输入给出 hex 格式提示。
const COLOR_TYPE_HINT =
  '颜色需为 {r,g,b[,a]} 对象(通道 0-1,0-255 色值请先除以 255)或 hex 字符串(#RGB/#RGBA/#RRGGBB/#RRGGBBAA,如 "#ff0000")';

const colorSchema = z
  .unknown()
  .superRefine((v, ctx) => {
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
  })
  .transform((v) =>
    typeof v === 'string'
      ? (parseHexColor(v) ?? { r: 0, g: 0, b: 0 })
      : (v as { r: number; g: number; b: number; a?: number }),
  );

export const rgbSchema = colorSchema.describe(
  '颜色:{r,g,b} 对象(通道 0-1)或 hex 字符串,如 "#ff0000"(带透明度可用 8 位 hex,其 alpha 会转为 paint 级 opacity)',
);
export type RGB = z.infer<typeof rgbSchema>;

export const rgbaSchema = colorSchema.describe(
  'RGBA 颜色:{r,g,b,a} 对象(通道 0-1,a 缺省按 1)或 hex 字符串,如 "#ff0000"、"#ff000080"',
);
export type RGBA = z.infer<typeof rgbaSchema>;

export const gradientStopSchema = z
  .object({
    color: rgbaSchema.describe('该停止点的颜色(带 alpha)'),
    position: z
      .number()
      .min(0)
      .max(1)
      .describe('停止点位置,范围 0-1(0=起点,1=终点)'),
  })
  .describe(
    '渐变停止点,如 {color:{r:1,g:0,b:0,a:1}, position:0}(起点红色)和 {color:{r:0,g:0,b:1,a:1}, position:1}(终点蓝色)',
  );
export type GradientStop = z.infer<typeof gradientStopSchema>;

export const transformSchema = z
  .tuple([
    z.tuple([z.number(), z.number(), z.number()]),
    z.tuple([z.number(), z.number(), z.number()]),
  ])
  .describe('变换矩阵,如 [[1,0,0],[0,1,0]] 表示无变换(Identity)');
export type Transform = z.infer<typeof transformSchema>;

// 混合模式 (对齐 runtime BlendMode)
export const blendModeSchema = z
  .enum([
    'PASS_THROUGH',
    'NORMAL',
    'DARKEN',
    'MULTIPLY',
    'COLOR_BURN',
    'LIGHTEN',
    'SCREEN',
    'COLOR_DODGE',
    'OVERLAY',
    'SOFT_LIGHT',
    'HARD_LIGHT',
    'DIFFERENCE',
    'EXCLUSION',
    'HUE',
    'SATURATION',
    'COLOR',
    'LUMINOSITY',
  ])
  .describe(
    '混合模式:PASS_THROUGH=穿透 | NORMAL=正常 | DARKEN=变暗 | MULTIPLY=正片叠底 | COLOR_BURN=颜色加深 | LIGHTEN=变亮 | SCREEN=滤色 | COLOR_DODGE=颜色减淡 | OVERLAY=叠加 | SOFT_LIGHT=柔光 | HARD_LIGHT=强光 | DIFFERENCE=差值 | EXCLUSION=排除 | HUE=色相 | SATURATION=饱和度 | COLOR=颜色 | LUMINOSITY=明度',
  );
export type BlendMode = z.infer<typeof blendModeSchema>;

// Paint: 填充/描边的统一表示 (对齐 runtime Paint union)
export const paintSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('SOLID').describe('填充类型:纯色'),
      color: rgbSchema.describe(
        '纯色值,支持 {r,g,b} 对象(通道 0-1)或 hex 字符串,如 "#ff0000"',
      ),
      opacity: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('不透明度 0-1,缺省 1'),
      visible: z.boolean().optional().describe('是否可见,缺省 true'),
      blendMode: blendModeSchema.optional().describe('混合模式,缺省 NORMAL'),
    })
    .strict()
    .describe('纯色填充(SOLID):{color:{r,g,b}}'),
  z
    .object({
      type: z.literal('GRADIENT_LINEAR').describe('填充类型:线性渐变'),
      gradientStops: z
        .array(gradientStopSchema)
        .describe('渐变停止点数组(至少 2 个,定义颜色与位置)'),
      gradientTransform: transformSchema,
    })
    .strict()
    .describe('线性渐变(GRADIENT_LINEAR):沿直线方向过渡'),
  z
    .object({
      type: z.literal('GRADIENT_RADIAL').describe('填充类型:径向渐变'),
      gradientStops: z
        .array(gradientStopSchema)
        .describe('渐变停止点数组(至少 2 个,定义颜色与位置)'),
      gradientTransform: transformSchema,
    })
    .strict()
    .describe('径向渐变(GRADIENT_RADIAL):从中心向外辐射'),
  z
    .object({
      type: z.literal('GRADIENT_ANGULAR').describe('填充类型:角度渐变'),
      gradientStops: z
        .array(gradientStopSchema)
        .describe('渐变停止点数组(至少 2 个,定义颜色与位置)'),
      gradientTransform: transformSchema,
    })
    .strict()
    .describe('角度渐变(GRADIENT_ANGULAR):沿圆周方向过渡'),
  z
    .object({
      type: z.literal('IMAGE').describe('填充类型:图片填充'),
      imageHash: z.string().describe('图片资源哈希(由 jsd_fill_image 等注入)'),
      scaleMode: z
        .enum(['FILL', 'FIT', 'CROP', 'TILE'])
        .optional()
        .describe('缩放模式:FILL=填充裁剪|FIT=完整适配|CROP=裁剪|TILE=平铺'),
    })
    .strict()
    .describe('图片填充(IMAGE):以 imageHash 引用图片'),
]);
export type Paint = z.infer<typeof paintSchema>;

// 效果 (对齐 runtime Effect discriminated union)
export const effectSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z
        .literal('DROP_SHADOW')
        .describe('效果类型:外阴影(投影到节点外侧)'),
      color: rgbaSchema.describe('阴影颜色(带 alpha 透明度)'),
      offset: z
        .object({
          x: z.number().describe('水平偏移(px),正值向右'),
          y: z.number().describe('垂直偏移(px),正值向下'),
        })
        .describe('阴影偏移向量(px)'),
      radius: z.number().min(0).describe('模糊半径(px),>=0'),
      spread: z
        .number()
        .optional()
        .describe('扩散(px),正值扩大阴影、负值收缩,默认 0'),
      visible: z.boolean().optional().describe('是否可见,默认 true'),
      blendMode: blendModeSchema
        .default('NORMAL')
        .describe('混合模式,默认 NORMAL'),
      showShadowBehindNode: z
        .boolean()
        .optional()
        .describe('是否在节点后方显示阴影(即便节点不透明也透出)'),
    })
    .strict()
    .describe('外阴影(DROP_SHADOW):投影到节点外侧的阴影'),
  z
    .object({
      type: z
        .literal('INNER_SHADOW')
        .describe('效果类型:内阴影(投影到节点内侧)'),
      color: rgbaSchema.describe('阴影颜色(带 alpha 透明度)'),
      offset: z
        .object({
          x: z.number().describe('水平偏移(px),正值向右'),
          y: z.number().describe('垂直偏移(px),正值向下'),
        })
        .describe('阴影偏移向量(px)'),
      radius: z.number().min(0).describe('模糊半径(px),>=0'),
      spread: z
        .number()
        .optional()
        .describe('扩散(px),正值扩大、负值收缩,默认 0'),
      visible: z.boolean().optional().describe('是否可见,默认 true'),
      blendMode: blendModeSchema
        .default('NORMAL')
        .describe('混合模式,默认 NORMAL'),
    })
    .strict()
    .describe('内阴影(INNER_SHADOW):投影到节点内侧的阴影'),
  z
    .object({
      type: z
        .literal('LAYER_BLUR')
        .describe('效果类型:图层模糊(模糊整个节点本身)'),
      radius: z.number().min(0).describe('模糊半径(px),>=0'),
      visible: z.boolean().optional().describe('是否可见,默认 true'),
    })
    .strict()
    .describe('图层模糊(LAYER_BLUR):模糊节点自身'),
  z
    .object({
      type: z
        .literal('BACKGROUND_BLUR')
        .describe('效果类型:背景模糊(模糊节点背后的内容)'),
      radius: z.number().min(0).describe('模糊半径(px),>=0'),
      visible: z.boolean().optional().describe('是否可见,默认 true'),
    })
    .strict()
    .describe('背景模糊(BACKGROUND_BLUR):模糊节点背后的内容'),
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
      .describe('网格类型:ROWS|COLUMNS|GRID'),
    alignment: z
      .enum(['MIN', 'MAX', 'CENTER', 'STRETCH'])
      .optional()
      .describe('对齐:MIN|MAX|CENTER|STRETCH'),
    sectionSize: z.number().optional().describe('分节尺寸(px)'),
    count: z.number().int().positive().optional(),
    gutterSize: z.number().optional().describe('沟槽尺寸(px)'),
    offset: z.number().optional().describe('偏移(px)'),
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
    .describe('环绕规则:NONZERO|EVENODD|NONE,默认 NONZERO'),
});

// 字体 (对齐 runtime FontName)
export const fontNameSchema = z.object({
  family: z.string().describe('字体族,如 "PingFang SC"/"Inter"'),
  style: z.string().describe('字型,如 "Regular"/"Bold"/"Medium"'),
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
      value: z.number().describe('行高数值(px)'),
      unit: z.literal('PIXELS').describe('单位:PIXELS=固定像素'),
    })
    .describe(
      '固定行高:{value: 数值, unit: "PIXELS"},如 {value: 24, unit: "PIXELS"}',
    ),
  z
    .object({
      value: z.number().describe('行高数值(百分比)'),
      unit: z.literal('PERCENT').describe('单位:PERCENT=百分比'),
    })
    .describe(
      '百分比行高:{value: 数值, unit: "PERCENT"},如 {value: 150, unit: "PERCENT"}',
    ),
  z
    .object({ unit: z.literal('AUTO').describe('单位:AUTO=自动行高') })
    .describe('自动行高:{unit: "AUTO"},无需传 value'),
]);

// 字距 (对齐 runtime LetterSpacing)
export interface LetterSpacing {
  value: number;
  unit: 'PIXELS' | 'PERCENT';
}

export const letterSpacingSchema: z.ZodType<LetterSpacing> = z.object({
  value: z.number(),
  unit: z
    .enum(['PIXELS', 'PERCENT'])
    .describe('单位:PIXELS=像素 | PERCENT=百分比'),
});
