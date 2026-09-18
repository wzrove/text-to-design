import type { NodeSkeleton } from '../host';

/**
 * 「样式类字段」的两份风险集合与它们的告警文案 —— **唯一真源**。
 *
 * 此前同一件事有三份事实:`shared/core/update.ts` 里的 INSTANCE_RISKY_PROPS(27 项)
 * 与 CONTAINER_SELF_VISIBLE_PROPS(20 项,前 16 项与前者重复),外加
 * `mcp-server/tools/props.ts` 里一段手写文案第三次描述同一集合。
 * 改一处漏一处,症状是「用户拿到写成功了但没渲染的结果,而没有任何提示」。
 *
 * 现在:集合在这里声明一次,MCP 侧的工具描述文案由 {@link instanceStyleRiskNotice}
 * 从集合生成 —— 不再有「集合与文案各写各的」这种漂移。
 */

/**
 * 写在 INSTANCE 内的子节点上时,平台不保证渲染生效(P7:实测 fills / fontName
 * 回显是新值、渲染仍是组件原样式;其余样式同类风险)。
 *
 * 几何/结构/命名类字段(x/y/width/height/name/visible/locked/布局)不在其列 ——
 * 那些在实例上是正常生效的覆盖,不该报风险。
 */
export const INSTANCE_STYLE_RISK_PROPS: ReadonlySet<string> = new Set([
  'fills',
  'strokes',
  'strokeWeight',
  'strokeTopWeight',
  'strokeBottomWeight',
  'strokeLeftWeight',
  'strokeRightWeight',
  'strokeAlign',
  'strokeCap',
  'strokeJoin',
  'dashPattern',
  'blendMode',
  'effects',
  'cornerRadius',
  'topLeftRadius',
  'topRightRadius',
  'bottomLeftRadius',
  'bottomRightRadius',
  'cornerSmoothing',
  'fontName',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'textCase',
  'textDecoration',
  'textAlignHorizontal',
  'textAlignVertical',
]);

/**
 * 容器自身被改时**肉眼看得见**的字段(P26:给 24×24 图标 FRAME 传 recursive 刷
 * 描边,12 个图标外框全被套上 strokeWeight:1 的方框)。
 *
 * 与上面那份的前 16 项是**刻意共享**的同一组样式字段 —— 重叠由
 * `__tests__/prop-risk.test.ts` 断言为显式子集,不再是两处巧合重复。
 *
 * 只有 includeSelf=true 且命中这些字段时才提示:布局/可见性/命名类改自身是正常
 * 预期,提示会刷屏。
 */
export const CONTAINER_SELF_VISIBLE_PROPS: ReadonlySet<string> = new Set([
  'fills',
  'strokes',
  'strokeWeight',
  'strokeTopWeight',
  'strokeBottomWeight',
  'strokeLeftWeight',
  'strokeRightWeight',
  'strokeAlign',
  'strokeCap',
  'strokeJoin',
  'dashPattern',
  'blendMode',
  'effects',
  'cornerRadius',
  'topLeftRadius',
  'topRightRadius',
  'bottomLeftRadius',
  'bottomRightRadius',
  'cornerSmoothing',
  'clipsContent',
  'layoutGrids',
  'arcData',
]);

/** 两个集合的共享部分:改样式时既可能「实例内不生效」也可能「画在容器自身上」 */
export const SHARED_STYLE_PROPS: ReadonlySet<string> = new Set(
  [...CONTAINER_SELF_VISIBLE_PROPS].filter((k) =>
    INSTANCE_STYLE_RISK_PROPS.has(k),
  ),
);

/** 风险提示里最多点名几个节点,其余折叠成计数,免得递归批量时刷屏 */
export const WARN_SAMPLE = 3;

/**
 * MCP 工具描述尾部用的风险提示 —— 由上面的集合生成,不手写。
 *
 * 集合里加了新字段,描述会跟着变;描述不再可能与判定不一致。
 */
export function instanceStyleRiskNotice(): string {
  const sample = [...INSTANCE_STYLE_RISK_PROPS].slice(0, 2).join(' / ');
  return [
    `⚠ 对位于 INSTANCE 内的子节点改样式有平台风险:回显是新值,渲染却可能仍是组件原样式(实测 ${sample},其余样式同类风险);`,
    '命中时本次结果会带 warnings 并给出主组件里对应子节点的 id —— 改它即所有实例继承;',
    '只要单个实例不同,先 jsd_detach_instance 再改。',
  ].join('');
}

/**
 * 实例子节点样式改不动的**可执行出口**:顺着名字路径在实例的主组件里定位同源
 * 子节点,把它的 id 直接算出来。调用方拿到就能改主组件(所有实例一起继承),
 * 不必自己再翻组件树。名字对不上(改过名 / 结构不一致)返回 null,
 * 由告警文案回落为「改主组件或 detach」。
 */
export function instanceStyleFixHint(
  instance: NodeSkeleton,
  node: NodeSkeleton,
): string | null {
  try {
    const main = instance.mainComponent ?? null;
    if (main == null) return null;
    const path: string[] = [];
    let cur: NodeSkeleton | null = node;
    while (cur != null && cur.id !== instance.id) {
      path.unshift(cur.name);
      cur = cur.parent;
    }
    if (path.length === 0) return null;
    let target: NodeSkeleton = main;
    for (const name of path) {
      const next = (target.children ?? []).find((c) => c.name === name);
      if (next == null) return null;
      target = next;
    }
    return `主组件(${main.id})里的「${node.name}」(${target.id})`;
  } catch {
    return null;
  }
}
