/**
 * 编译期同步断言(design-core 版):host.ts 节点骨架字段必须与 shared 线格式保持同步。
 *
 * - 背景:NodeSkeleton 的 Paint/Effect/BlendMode 字段直接复用 shared 类型,
 *   本文件锁定两者不漂移(有人把 skeleton 字段改成局部类型时 typecheck 报错)。
 * - 运行时子集约束(shared.Paint ⊆ 平台运行时 Paint)仍需在含平台 typings 的
 *   薄壳包(ui/src/code/sync-guarantee.ts)里维护,core 不依赖平台 typings。
 */

import type * as shared from '../schemas';
import type { NodeSkeleton } from './host';

// 节点骨架的填充/描边/效果/混合模式字段必须与 shared 线格式同一类型(双向)
type SkeletonPaint = NonNullable<NodeSkeleton['fills']>[number];
type SkeletonEffect = NonNullable<NodeSkeleton['effects']>[number];
type SkeletonBlendMode = NonNullable<NodeSkeleton['blendMode']>;

export const _paintToSkeleton: shared.Paint extends SkeletonPaint
  ? true
  : false = true;
export const _paintFromSkeleton: SkeletonPaint extends shared.Paint
  ? true
  : false = true;
export const _effectToSkeleton: shared.Effect extends SkeletonEffect
  ? true
  : false = true;
export const _effectFromSkeleton: SkeletonEffect extends shared.Effect
  ? true
  : false = true;
export const _blendModeToSkeleton: shared.BlendMode extends SkeletonBlendMode
  ? true
  : false = true;
export const _blendModeFromSkeleton: SkeletonBlendMode extends shared.BlendMode
  ? true
  : false = true;
