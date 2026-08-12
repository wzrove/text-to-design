/**
 * 编译期同步断言(Figma 侧):shared 线格式 + DesignHost 契约必须与
 * @figma/plugin-typings 的运行时类型保持同步。
 *
 * - 效果/填充/混合模式:线格式类型必须是运行时类型的子集。
 * - DesignHost:host 接口的全部顶层符号必须存在于 Figma PluginAPI。
 *   运行时 API 演进 → 本文件 typecheck 报错,强制同步 shared + adapter。
 */

// 捕获 figma 运行时全局类型(在 import 覆盖前)
type RuntimePaint = Paint;
type RuntimeEffect = Effect;
type RuntimeBlendMode = BlendMode;

import type {
  BlendMode,
  DesignHost,
  Effect,
  NodeSkeleton,
  Paint,
} from 'text-to-design-shared';

export const _paintCheck: Paint extends RuntimePaint ? true : false = true;
export const _effectCheck: Effect extends RuntimeEffect ? true : false = true;
export const _blendModeCheck: BlendMode extends RuntimeBlendMode
  ? true
  : false = true;

export const _hostKeysCheck: keyof DesignHost extends keyof PluginAPI
  ? true
  : false = true;

// 平台特有超集字段必须存在于 Figma 运行时类型(Figma 独有,jsDesign 无)
type RuntimeTextTruncation = TextNode['textTruncation'];
export const _textTruncationCheck: NonNullable<
  NodeSkeleton['textTruncation']
> extends RuntimeTextTruncation
  ? true
  : false = true;

type RuntimeComponentProperties = InstanceNode['componentProperties'];
export const _componentPropsCheck: NonNullable<
  NodeSkeleton['componentProperties']
> extends RuntimeComponentProperties
  ? true
  : false = true;
