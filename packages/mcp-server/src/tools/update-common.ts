import {
  applicabilityMissNotice,
  PROP_APPLICABILITY,
  PROP_METHOD_FIELDS,
  type PropMethod,
  updatedResultSchema,
} from 'text-to-design-shared';
import type { z } from 'zod';
import type { BridgeToolDef, FollowUp, ToolHints } from '../core/registry';

/**
 * 「属性 → 适用节点类型」表已收敛到 shared 字典(dicts/prop-applicability):
 * 写路径 core/update.ts 的 per-prop 类型 gate 与这里的「未生效属性点名」共用
 * 同一份数据,不再靠人手工同步。此处只消费,不再维护副本。
 */

type UpdateData = {
  updated: { id: string; type?: string }[];
  warnings?: string[];
};

/**
 * 属性类工具的统一成功反馈:更新计数 + 平台警告透传 + 未生效字段点名 +
 * 未命中 id 点名。jsd_update_node 与拆分出的 jsd_set_* 小工具共用。
 */
export function updateFeedback(
  data: unknown,
  requested: string[],
  requestedIds: string[] = [],
): { type: 'text'; text: string }[] {
  const payload = data as UpdateData | undefined;
  const updated = payload?.updated ?? [];
  const blocks: { type: 'text'; text: string }[] = [];
  if (updated.length > 0)
    blocks.push({ type: 'text', text: `已更新 ${updated.length} 个节点` });
  // 写时检测到的平台已知问题(如实例内文字覆盖渲染不生效),显式透传
  const warnings = payload?.warnings ?? [];
  for (const w of warnings) {
    blocks.push({ type: 'text', text: `⚠ ${w}` });
  }
  // 类型不匹配的属性被 runtime 静默跳过,这里显式点名,避免调用方误以为生效
  //
  // 修订:原条件 `updated.length > 0 && requested.length === 0` 写反 —— 实际
  // 触发于「调用方传了非类型门控字段(strokes / fills / effects 等)且至少 1 个节点
  // 被改」的常见路径,与上一行「已更新 N 个节点」互相矛盾。`requested` 只统计
  // PROP_APPLICABILITY(类型门控)字段,所以 strokes/fills 永远 0,误报恒出。
  // 改成「真的什么都没改」才报,且只取「未改 + 也没传适用属性」这一格。
  if (updated.length === 0 && requested.length === 0) {
    blocks.push({ type: 'text', text: '未传入任何属性,本次未修改' });
  } else if (updated.length > 0 && requested.length > 0) {
    const skipped = requested.filter((k) => {
      const applicable = PROP_APPLICABILITY[k];
      return (
        applicable != null &&
        !updated.some(
          (n) => n.type != null && applicable.some((t) => t === n.type),
        )
      );
    });
    if (skipped.length > 0) {
      const notice = applicabilityMissNotice(skipped);
      if (notice != null) blocks.push({ type: 'text', text: notice });
    }
  }
  if (requestedIds.length > 0) {
    const got = new Set(updated.map((n) => n.id));
    const missing = requestedIds.filter((id) => !got.has(id));
    if (missing.length > 0) {
      blocks.push({
        type: 'text',
        text: `以下节点未更新(可能已失效/被连坐删除): ${missing.join(', ')}。可用 jsd_find 复核后重试`,
      });
    }
  }
  return blocks;
}

/**
 * recursive 历史上是「自身 + 全部后代」,给容器 FRAME 传它刷描边会连容器自己
 * 一起套上方框。现在默认只作用于后代,这条语义变化必须随工具描述一起下发 ——
 * 否则调用方按旧文档理解会以为「容器自身没改」是失败。统一在 propUpdateTool 里
 * 追加,11 个属性工具一处维护、不逐条抄。
 */
const RECURSIVE_SELF_NOTE =
  '⚠ recursive=true 只作用于**后代**,不含目标节点自身(给图标/容器传 recursive 刷色,容器自己不再被印上方框);无子节点的叶子自身即整棵子树,仍会改。要把容器自己也算上才显式传 includeSelf=true,那时结果会带 warnings 点名「容器自身也被修改」。';

/** 属性类小工具定义:声明属性引擎方法名与对应入参 schema */
export interface PropToolDef {
  name: string;
  title: string;
  description: string;
  /** 属性引擎方法名;本工具负责的字段集由 PROP_METHOD_FIELDS[method] 唯一决定 */
  method: PropMethod;
  inputSchema: z.ZodType;
  annotations?: ToolHints;
  /** 工具结果的 followUp 引导(指向推荐的下一个工具) */
  followUp?: FollowUp;
}

/**
 * 声明式构造属性类小工具:入参按 ids/matchName/recursive 定位 + 扁平属性字段,
 * 下发时归入对应属性方法的 props。字段集由 PROP_METHOD_FIELDS[method] 派生,
 * 与入参 schema 同源,不会出现两边漂移;调用方不需要先选一个 50 键的大表再挑字段。
 */
export function propUpdateTool(def: PropToolDef): BridgeToolDef {
  const fields = PROP_METHOD_FIELDS[def.method];
  // 只点名本方法 OWNER 的字段做「未生效」反馈:某些字段虽在本方法入参里
  // (如 resize 的 x/y),却不登记在 PROP_APPLICABILITY,点名会被误报成
  // 「与目标节点类型不匹配,已被忽略」。这些几何字段永远生效,不参与点名。
  const requestedProps = (args: Record<string, unknown>): string[] =>
    fields.filter(
      (k) => args[k] !== undefined && PROP_APPLICABILITY[k] !== undefined,
    );
  // 修订:recursive=true 默认不含目标自身(recursive 的新语义),目标 id 合法地不会出现在
  // updated 里 —— 把它交给下面的「missing」分支会被误报成「可能已失效」。这里
  // 预先从 requestedIds 里剔除「按语义本就不该出现在 updated 中的目标」,留出的
  // 是「调用方预期会出现在 updated 的 id」清单,后代 id 不在 args.ids 列表中,
  // 自然不受影响(仍会按真实缺失点出)。
  const expectedUpdatedIds = (args: Record<string, unknown>): string[] => {
    const ids = (args.ids as string[] | undefined) ?? [];
    if (args.recursive === true && args.includeSelf !== true) return [];
    return ids;
  };
  return {
    name: def.name,
    title: def.title,
    description: def.description + RECURSIVE_SELF_NOTE,
    inputSchema: def.inputSchema,
    outputSchema: updatedResultSchema,
    annotations: def.annotations,
    method: def.method,
    payload: (args) => {
      const { ids, matchName, recursive, includeSelf, ...props } = args;
      const out: Record<string, unknown> = { props };
      if (ids !== undefined) out.ids = ids;
      if (matchName !== undefined) out.matchName = matchName;
      if (recursive !== undefined) out.recursive = recursive;
      if (includeSelf !== undefined) out.includeSelf = includeSelf;
      return out;
    },
    ...(def.followUp !== undefined ? { followUp: def.followUp } : {}),
    extraContent: (data, args) =>
      updateFeedback(data, requestedProps(args), expectedUpdatedIds(args)),
  };
}
