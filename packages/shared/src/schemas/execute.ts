import { z } from 'zod';

import { executeNodeSchema } from './execute-schemas';

export const placementSchema = z
  .object({
    mode: z
      .enum(['center', 'manual', 'absolute'])
      .optional()
      .describe(
        '放置模式:center=把每个根节点各自移到视口中心(缺省;会忽略 ops 内根节点自身的 x/y,多个根节点会互相叠放)|manual=保留 ops 内根节点自身的 x/y(按坐标布局用这个)|absolute=把所有根节点统一放到下方 x/y(必填,多根会叠在同一坐标)。建议一次调用只建一个根节点,层级结构用 children 表达',
      ),
    x: z
      .number()
      .optional()
      .describe(
        'absolute 模式下所有根节点的 X 坐标,与 mode="absolute" 配合使用',
      ),
    y: z
      .number()
      .optional()
      .describe(
        'absolute 模式下所有根节点的 Y 坐标,与 mode="absolute" 配合使用',
      ),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'absolute' && (val.x == null || val.y == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'placement.mode 为 absolute 时,x 和 y 均为必填项',
        path: val.x == null ? ['x'] : ['y'],
      });
    }
  });

export const executeSchema = z
  .object({
    ops: z
      .array(executeNodeSchema)
      .describe(
        '设计指令节点树;建议单一根节点(多个根节点会被 placement 统一摆放,可能互相叠放)',
      ),
    placement: placementSchema
      .optional()
      .describe(
        '放置方式,缺省 center 居中且忽略 ops 内根节点的 x/y。需要按坐标摆放时传 mode:"manual"(保留 ops 内 x/y)或 "absolute"(顶层统一坐标)',
      ),
  })
  .strict();

export const createSvgSchema = z.object({
  svg: z
    .string()
    .describe(
      '完整 SVG 字符串,如 <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M0 0 L100 0 L100 100 Z" fill="#ff0000"/></svg>',
    ),
  name: z.string().optional().describe('生成的图层名,默认 svg-design'),
});

export const htmlToDesignSchema = z.object({
  html: z.string().describe('HTML 片段,支持内联 style'),
  name: z.string().optional().describe('生成的图层名,默认 html-design'),
});

export const createIconSchema = z.object({
  icon: z
    .string()
    .describe(
      '图标名/别名/语义描述,如 home、arrow-right、search、magnifier(搜索);支持模糊匹配与别名联想,查无返回候选提示',
    ),
  size: z.number().optional().describe('图标边长 px,默认 24'),
  color: z.string().optional().describe('描边颜色(十六进制),默认 #000000'),
  strokeWidth: z.number().optional().describe('描边宽度,默认 2'),
  name: z.string().optional().describe('生成的图层名,默认 icon-<图标名>'),
});
