/**
 * 「像该上 auto-layout」的机械判据。
 *
 * ## 为什么要有这个东西
 *
 * 配方(`skill://canvas/references/auto-layout.md`)与 instructions 都写了「屏内分区一律先上布局」,
 * 但两条通路都不保证被读到:instructions 多数宿主读完即弃(见 dec 0030 一节的实测),
 * 配方要模型主动 ReadMcpResource。于是**最常见的失败形态是「没人说不许手摆坐标」** ——
 * 模型手算 x/y 建出一排等距卡片,一路绿灯,直到要改文案或加一项才发现每处都要重算。
 *
 * 这里在**创建结果**上补一条 warning:它出现在模型必然要读的位置(工具返回值),
 * 且判据客观 —— 同级子节点同轴、等距。不判「设计意图」,只报观测事实。
 *
 * ## 为什么放在 MCP 侧而不是插件里
 *
 * 插件只知道「节点建好了」;只有 MCP 侧同时看得到**调用方写的入参**(含 layoutMode
 * 是否声明)与 build 后的结果。判据纯粹是入参的几何,不需要一次额外往返。
 */

type Rect = { x?: unknown; y?: unknown; width?: unknown; height?: unknown };

/** 等距/同轴的像素容差:坐标是浮点,1.5px 以内的抖动不算「不齐」 */
const TOLERANCE = 1.5;

export type UniformLayoutHit = {
  /** 命中的子节点数 */
  count: number;
  /** 建议的布局方向,与 layoutMode 取值同名,便于直接照抄 */
  mode: 'HORIZONTAL' | 'VERTICAL';
  /** 实测间距(px,取最小值,已取整) */
  gap: number;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toRects(children: unknown): Rect[] | null {
  if (!Array.isArray(children) || children.length < 3) return null;
  const out: Rect[] = [];
  for (const raw of children) {
    if (raw == null || typeof raw !== 'object') return null;
    out.push(raw as Rect);
  }
  return out;
}

/** 该轴上的首尾间距序列(按起点排序后,相邻两项的空隙) */
function gapsAlong(rects: Rect[], axis: 'x' | 'y'): number[] | null {
  const size = axis === 'x' ? 'width' : 'height';
  const items: { start: number; size: number }[] = [];
  for (const r of rects) {
    const start = num(r[axis]);
    const extent = num(r[size]);
    // 缺坐标或尺寸的节点无法判等距 —— 交还调用方,不猜
    if (start == null || extent == null) return null;
    items.push({ start, size: extent });
  }
  items.sort((a, b) => a.start - b.start);
  const out: number[] = [];
  for (let i = 1; i < items.length; i += 1) {
    out.push(items[i].start - (items[i - 1].start + items[i - 1].size));
  }
  return out;
}

function sameStart(rects: Rect[], axis: 'x' | 'y'): boolean {
  const first = num(rects[0][axis]);
  if (first == null) return false;
  return rects.every((r) => {
    const v = num(r[axis]);
    return v != null && Math.abs(v - first) <= TOLERANCE;
  });
}

/**
 * 判 FRAME 入参是不是「一排/一列等距但不带布局」。
 *
 * 只在**三个条件同时成立**时命中,避免把正常的手工排版全报一遍:
 * ① 子节点 ≥ 3(2 个也等距,但两个元素上布局的收益远小于结构噪声);
 * ② 交叉轴起点全部对齐(同一 y 的横排 / 同一 x 的纵列);
 * ③ 主轴空隙 ≥ 0 且彼此相差 ≤ 容差(等距)。
 *
 * 已显式声明 layoutMode 的容器直接放过 —— 那正是我们想要的结果。
 */
export function detectUniformLayout(
  args: Record<string, unknown>,
): UniformLayoutHit | null {
  const mode = args.layoutMode;
  if (mode === 'HORIZONTAL' || mode === 'VERTICAL') return null;
  const rects = toRects(args.children);
  if (rects == null) return null;

  const verticalDown = sameStart(rects, 'x');
  const horizontalAcross = sameStart(rects, 'y');
  // 两个方向都「对齐」= 全叠在一个点上(常见于先建后摆的中间态),不报
  if (verticalDown === horizontalAcross) return null;

  const axis: 'x' | 'y' = verticalDown ? 'y' : 'x';
  const gaps = gapsAlong(rects, axis);
  if (gaps == null || gaps.length < 2) return null;

  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  if (min < 0) return null;
  if (max - min > TOLERANCE) return null;

  return {
    count: rects.length,
    mode: verticalDown ? 'VERTICAL' : 'HORIZONTAL',
    gap: Math.round(min),
  };
}
