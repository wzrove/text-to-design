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

/**
 * 插件线格式:导入 SVG。**`svg` 在这里是必填** —— 到插件这一步,来源之争已经
 * 在 MCP 侧解完了(见下面的 `createSvgInputSchema`),插件只收字符串。
 * 把来源选择放进这个 schema 会让插件也要处理「路径」,而它没有读盘能力。
 */
export const createSvgSchema = z.object({
  svg: z
    .string()
    .describe(
      '完整 SVG 字符串,如 <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M0 0 L100 0 L100 100 Z" fill="#ff0000"/></svg>',
    ),
  name: z.string().optional().describe('schema.execute.name'),
});

/**
 * `jsd_create_svg` 的入参:来源**二选一** —— 内联字符串 `svg`,或本地文件 `svgPath`。
 *
 * 为什么要开文件来源:代码生成的图表动辄几十 KB,整份塞进入参既费上下文、
 * 又容易在换行与转义上出错;落盘后只传路径,读盘这件事与 `jsd_fill_image` 的
 * `sourcePath` 同构(读盘的是后台服务,不是模型)。
 *
 * 两者都传、或都不传时**明确报错**而不是猜一个 —— 静默取其一,调用方会以为
 * 自己传的那份生效了。
 */
export const createSvgInputSchema = z
  .object({
    svg: z.string().optional().describe('完整 SVG 字符串(与 svgPath 二选一)'),
    svgPath: z
      .string()
      .optional()
      .describe(
        '本地 .svg 文件路径,由后台服务读取(与 svg 二选一)。**代码生成的大 SVG 走这条**',
      ),
    name: z.string().optional().describe('schema.execute.name'),
  })
  .strict()
  .superRefine((val, ctx) => {
    const has = (v: string | undefined): boolean =>
      typeof v === 'string' && v.trim() !== '';
    if (has(val.svg) === has(val.svgPath)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: has(val.svg)
          ? 'svg 与 svgPath 只能传一个:svgPath 是给「SVG 已在本地文件里」用的'
          : '必须传 svg(内联 SVG 字符串)或 svgPath(本地 .svg 文件路径),二选一',
        path: ['svg'],
      });
    }
  });

export const htmlToDesignSchema = z.object({
  html: z.string().describe('schema.execute.html'),
  name: z.string().optional().describe('schema.execute.name2'),
});

export const createIconSchema = z.object({
  icon: z
    .string()
    .describe(
      '图标名/别名/语义描述,如 home、arrow-right、search、magnifier(搜索);支持模糊匹配与别名联想,查无返回候选提示',
    ),
  size: z.number().optional().describe('schema.execute.size'),
  color: z.string().optional().describe('schema.execute.color'),
  strokeWidth: z.number().optional().describe('schema.execute.strokeWidth'),
  name: z.string().optional().describe('schema.execute.name3'),
});
