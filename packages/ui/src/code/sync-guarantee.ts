/**
 * 编译期同步断言:shared 的线格式类型必须与 plugin-api.d.ts 运行时类型保持同步。
 *
 * - 效果:线格式 Effect 必须是运行时 Effect 的子集(类型收窄安全)。
 *   运行时新增效果类型 → 本文件 typecheck 报错,强制同步 shared + 翻译器。
 * - 填充/描边:线格式 Paint 必须是运行时 Paint 的子集。
 * - 混合模式:线格式 BlendMode 必须是运行时 BlendMode 的子集。
 *
 * 字段级同步(运行时给已有类型新增字段)需配合往返测试,不在此文件覆盖范围。
 */

// 捕获运行时全局类型(在 import 覆盖前)
type RuntimePaint = Paint;
type RuntimeEffect = Effect;
type RuntimeBlendMode = BlendMode;

import type { BlendMode, Effect, Paint } from 'text-to-design-shared';

// Paint:线格式 Paint 必须可赋值给运行时 Paint(子集约束)
export const _paintCheck: Paint extends RuntimePaint ? true : false = true;

// Effect:线格式 Effect 必须可赋值给运行时 Effect(子集约束)
export const _effectCheck: Effect extends RuntimeEffect ? true : false = true;

// BlendMode:线格式 BlendMode 必须可赋值给运行时 BlendMode(子集约束)
export const _blendModeCheck: BlendMode extends RuntimeBlendMode
  ? true
  : false = true;
