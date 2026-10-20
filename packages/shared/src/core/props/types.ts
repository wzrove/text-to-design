import { propAppliesTo } from '../../dicts/prop-applicability';
import type { DesignHost, NodeSkeleton } from '../host';
import type { RuntimeContext } from '../runtime';
import { gatePropWrite } from './platform-gate';

/**
 * 写后反馈的收集器。
 *
 * 此前「某个字段为什么没生效」这件事分散在 update.ts / buildNode.ts / props.ts 三处
 * 各说各话(能力门控 Set、实例风险 Set、文案常量)。统一到这一个出口,由
 * `runWriters` 之后统一跑固定顺序的检查链(见设计决策 0004)。
 */
export interface WriteOutcome {
  /** 能力门控 / 类型不匹配 → 本次实际没写进去的 key */
  ignored: Set<string>;
  /** 回读不一致但已自动压回的项 */
  readback: { key: string; ok: boolean }[];
  warnings: string[];
}

export function emptyOutcome(): WriteOutcome {
  return { ignored: new Set(), readback: [], warnings: [] };
}

/**
 * 一次写路径的上下文。
 *
 * 两条路径(创建 / 修改)共用同一批 writer,差异靠 `create` 显式区分 ——
 * 不再靠「谁碰巧写在后面」这种隐式顺序。
 */
export interface WriteCtx {
  host: DesignHost;
  /** 平台能力上下文(显式注入,见 core/runtime.ts) */
  ctx: RuntimeContext;
  node: NodeSkeleton;
  /** 本次请求携带的原始输入(创建路径是 spec,修改路径是 props);只读 */
  src: Readonly<Record<string, unknown>>;
  outcome: WriteOutcome;
  /** true = 创建路径:允许默认值与推断;false = 修改路径:纯增量覆盖 */
  create: boolean;
  /**
   * 该节点是不是**最外层节点容器**(屏根 / 画板)。
   *
   * 必须由调用方显式给:创建期节点还没挂到父级(`parent` 恒为 null),靠父链探不出来。
   * 唯一用途是 sizingMode 推断 —— 屏根高度钉 FIXED,内层容器高度优先 AUTO。
   */
  outermost: boolean;
}

/**
 * 属性写入器。
 *
 * `keys` 是本 writer 认领的字段 —— 这份登记取代了此前散落的手抄清单
 * (dicts/prop-applicability 的登记表、plugin.ts 的方法名单等)。
 */
export interface PropWriter {
  readonly id: string;
  readonly keys: readonly string[];
  /** 主写入阶段 */
  write(ctx: WriteCtx): void | Promise<void>;
  /** 稳定化阶段:布局重算之后的回压(尺寸、方向) */
  settle?(ctx: WriteCtx): void | Promise<void>;
}

/** 节点对象上的动态读写:core 只声明它关心的字段,赋值按运行时存在性守卫 */
export function field(node: NodeSkeleton, key: string): unknown {
  return (node as unknown as Record<string, unknown>)[key];
}

export function setField(
  node: NodeSkeleton,
  key: string,
  value: unknown,
): void {
  (node as unknown as Record<string, unknown>)[key] = value;
}

/** 「给了值 且 节点上真有这个属性」才写 —— 两条路径共用的守卫 */
export function putIfPresent(
  node: NodeSkeleton,
  key: string,
  value: unknown,
): boolean {
  if (value == null) return false;
  if (!(key in node)) return false;
  setField(node, key, value);
  return true;
}

/**
 * **写路径的唯一收口**:先按平台类型系统与领域适用性判定,再落到 {@link putIfPresent}。
 *
 * 为什么要多这一层而不是各处直接 `putIfPresent`:
 * - 值域与适用性收窄是**分平台**的事实(`dicts/platform-value-domain.ts`),被拒时必须留下
 *   证据(`WriteOutcome`)—— 此前这类判定散在平台门面里,只能打 console(0007);
 * - 「属性 × 节点类型」是**领域事实**(`dicts/prop-applicability.ts`),同样必须在写入前拦下。
 *   此前只有 shapeWriter / layoutWriter 自己记得调 `propAppliesTo`,而 `paintWriter`
 *   (layoutGrids)与 `passthroughWriter`(clipsContent)是直写 —— 给矩形写 layoutGrids
 *   于是变成「回包成功、回读没有该字段」(2026-09-24 MG 真机踩到)。
 *
 * 表驱动的单一收口也保证「新增一条判定」只需改一张表,不必再找第二个写入口。
 *
 * 判定通过但节点上没这个属性时仍返回 false 且**不记 warnings** —— 那是既有的
 * 存在性守卫口径(未登记的平台差异一律 fail-open,不误报);适用性不匹配则**静默返回 false**,
 * 由结果装配期统一点名(`applicabilityMissNotice`:创建与修改两条路径共用那一句)。
 */
export function writeProp(
  w: WriteCtx,
  node: NodeSkeleton,
  key: string,
  value: unknown,
): boolean {
  if (!propWritable(w, node, key, value)) return false;
  return putIfPresent(node, key, value);
}

/** 写前判定(存在性 + 领域适用性 + 平台收窄);同步与异步两个入口共用,别在外面再判一遍 */
function propWritable(
  w: WriteCtx,
  node: NodeSkeleton,
  key: string,
  value: unknown,
): boolean {
  if (value == null) return false;
  if (!propAppliesTo(key, node.type)) return false;
  if (!gatePropWrite(w, key, value)) return false;
  return true;
}

/** 样式引用字段的异步入口名:与值成员一一对应,不在调用处拼字符串(拼错不会编译失败) */
const ASYNC_STYLE_SETTER = {
  fillStyleId: 'setFillStyleIdAsync',
  strokeStyleId: 'setStrokeStyleIdAsync',
  textStyleId: 'setTextStyleIdAsync',
  effectStyleId: 'setEffectStyleIdAsync',
} as const;

/**
 * 样式绑定(`*StyleId`)的唯一入口。
 *
 * 为什么不直接用 {@link writeProp}:Figma manifest 声明 dynamic-page 后,给
 * `fillStyleId` 赋值当场抛 `Cannot call with documentAccess: dynamic-page.
 * Use node.setFillStyleIdAsync instead.`(真机 2026-10-13)—— 那是**入口形态**问题,
 * 不是平台取值域问题,所以按 0011「新增成员一律异步」的口径优先走异步 setter,
 * 引擎没有异步变体时(jsDesign / MG)才退回同步赋值。
 */
export async function writeStyleRefProp(
  w: WriteCtx,
  node: NodeSkeleton,
  key: keyof typeof ASYNC_STYLE_SETTER,
  value: unknown,
): Promise<boolean> {
  if (!propWritable(w, node, key, value)) return false;
  const setter = (node as unknown as Record<string, unknown>)[
    ASYNC_STYLE_SETTER[key]
  ];
  if (typeof setter === 'function') {
    await (setter as (id: string) => Promise<void>).call(node, String(value));
    return true;
  }
  return putIfPresent(node, key, value);
}
