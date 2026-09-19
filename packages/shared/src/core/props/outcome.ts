import {
  UNAPPLIED_PROP_FALLBACK,
  UNAPPLIED_PROP_HINT,
} from '../../dicts/unapplied-prop';
import type { WriteOutcome } from './types';

/**
 * WriteOutcome 的回收与文案组装(配合设计决策 0004 / 0007)。
 *
 * 0004 把「某个字段为什么没生效」统一到 `WriteOutcome` 一个出口,但当时只有
 * **修改路径**回收了它:创建路径只把「能力门控」记进 warnings,
 * `readback.ok === false`(写了没生效)与 `warnings`(writer 自述)被静默丢弃 ——
 * 于是同一个平台缺陷在「建的时候」不点名,在「改的时候」才点名。
 *
 * 本模块是两条路径的共用出口:创建路径用 `CreateNotes` 收集,修改路径直接读
 * `WriteOutcome`,文案由同一份 `UNAPPLIED_PROP_HINT` 生成(不再各写一句)。
 */

/** 一条「写了没生效」:哪个字段、落在哪个节点上 */
export interface UnappliedProp {
  key: string;
  /** 节点标签,形如 `主按钮(12:34)` */
  label: string;
  /**
   * 本次实测到的具体原因(可选)。通用修法来自 `UNAPPLIED_PROP_HINT`,
   * 这里只补「这一次到底是哪种形态」—— 有它才不用调用方自己去猜。
   */
  detail?: string;
}

/** 创建路径的回收袋:一次调用(可能建多棵树)共用一份 */
export interface CreateNotes {
  /** 能力门控:声明了但当前平台运行时不长这个属性 */
  skipped: Set<string>;
  /** 回读与本请求不一致的字段 */
  unapplied: UnappliedProp[];
  /** writer 自述类告警(写进 `WriteOutcome.warnings` 的那些) */
  messages: string[];
}

export function emptyNotes(): CreateNotes {
  return { skipped: new Set(), unapplied: [], messages: [] };
}

/** 告警里点名的节点标签:只给 id 认不出来,只给名称不唯一 */
export function nodeLabel(node: { id: string; name: string }): string {
  return `${node.name}(${node.id})`;
}

/**
 * 把一个节点的写入结果收进回收袋。文案不在这里生成 —— 这里只搬运事实,
 * 组装集中在 {@link unappliedWarning}(两条路径同一份措辞)。
 */
export function harvestOutcome(
  outcome: WriteOutcome,
  label: string,
  notes?: CreateNotes,
): void {
  if (notes == null) return;
  for (const r of outcome.readback) {
    if (r.ok !== false) continue;
    notes.unapplied.push({ key: r.key, label });
  }
  notes.messages.push(...outcome.warnings);
}

/**
 * 把回读不一致的项组装成一条人话告警(按字段归并,同字段的节点合并点名)。
 * 没有命中返回 null —— 调用方据此决定要不要往 warnings 里塞东西。
 *
 * 同一字段命中多个节点时,把各自的 `detail`(实测到的具体形态)也带上并去重:
 * 通用修法在 dicts 里,**这一次是哪一种形态只有现场知道**(如字体:是族被换掉,
 * 还是 style 写成简称没被解析)。
 */
export function unappliedWarning(
  items: readonly UnappliedProp[],
): string | null {
  if (items.length === 0) return null;
  const byKey = new Map<string, { labels: string[]; details: string[] }>();
  for (const it of items) {
    const group = byKey.get(it.key) ?? { labels: [], details: [] };
    if (!group.labels.includes(it.label)) group.labels.push(it.label);
    if (it.detail != null && !group.details.includes(it.detail)) {
      group.details.push(it.detail);
    }
    byKey.set(it.key, group);
  }
  const fields = [...byKey]
    .map(([key, g]) => `${key}(${g.labels.join('、')})`)
    .join('、');
  const hints = [...byKey]
    .map(([key, g]) => {
      const hint = UNAPPLIED_PROP_HINT[key] ?? UNAPPLIED_PROP_FALLBACK;
      const seen =
        g.details.length > 0 ? `本次实测:${g.details.join(';')}。` : '';
      return `· ${key}:${seen}${hint};`;
    })
    .join('');
  return [
    `以下字段写了但**没生效**(回读与本请求不一致):${fields}。`,
    hints,
    '回显成功 ≠ 画布生效:请用 jsd_find 复核实际值,关键视觉改动另配一次 jsd_export 导小图目检。',
  ].join('');
}
