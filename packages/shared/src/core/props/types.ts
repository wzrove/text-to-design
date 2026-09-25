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
  if (value == null) return false;
  if (!propAppliesTo(key, node.type)) return false;
  if (!gatePropWrite(w, key, value)) return false;
  return putIfPresent(node, key, value);
}
