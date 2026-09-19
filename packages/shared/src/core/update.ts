import { CAPABILITY_OF_GATED_PROP } from '../dicts/capability';
import type { PropMethod, SerializedNode, UpdateNodeProps } from '../schemas';
import { PROP_METHOD_FIELDS } from '../schemas';
import { isGatedPropUnsupported } from './capabilities';
import type { DesignHost, NodeSkeleton } from './host';
import {
  nodeLabel,
  type UnappliedProp,
  unappliedWarning,
} from './props/outcome';
import {
  CONTAINER_SELF_VISIBLE_PROPS,
  INSTANCE_STYLE_RISK_PROPS,
  instanceStyleFixHint,
  WARN_SAMPLE,
} from './props/risk';
import { runWriters } from './props/run';
import { emptyOutcome, type WriteOutcome } from './props/types';
import { UPDATE_WRITERS } from './props/writers';
import type { RuntimeContext } from './runtime';
import { serializeNode } from './serialize';
import { collectTargets, findNode, fontNotResolved } from './utils';

async function applyProps(
  host: DesignHost,
  ctx: RuntimeContext,
  node: NodeSkeleton,
  props: UpdateNodeProps & { x?: number; y?: number },
  outcome: WriteOutcome,
): Promise<void> {
  // 两条写路径共用同一批 writer(见 core/props/writers.ts):创建路径带默认值与
  // 推断,修改路径是纯增量覆盖 —— 差异由 create:false 显式表达,不再是两份代码。
  await runWriters(
    {
      host,
      node,
      ctx,
      create: false,
      src: props as Readonly<Record<string, unknown>>,
      outcome,
    },
    UPDATE_WRITERS,
  );
}

/** 沿父链找最近的 INSTANCE 祖先(实例子节点样式覆盖的平台缺陷只出现在这类节点上) */
function enclosingInstance(node: NodeSkeleton): NodeSkeleton | null {
  let p = node.parent;
  while (p != null) {
    if (p.type === 'INSTANCE') return p;
    p = p.parent;
  }
  return null;
}

// 两个「样式类字段」集合与风险文案的唯一真源,见 core/props/risk.ts。
// 此前这里一份、mcp-server/tools/props.ts 的文案里第三份描述同一集合 ——
// 改一处漏一处就变成「用户拿到改成功了但没渲染的结果,还没有提示」。

export async function updateSelection(
  host: DesignHost,
  ctx: RuntimeContext,
  params: {
    ids?: string[];
    matchName?: string;
    recursive?: boolean;
    /** recursive=true 时是否连目标节点自身一起改(默认 false,见 collectTargets) */
    includeSelf?: boolean;
    props: UpdateNodeProps;
  },
  /** 属性引擎方法名;给定则按该方法的字段白名单拦截越界字段 */
  method?: PropMethod,
): Promise<{ updated: SerializedNode[]; warnings?: string[] }> {
  const props = params.props ?? {};
  // 方法名即字段分组:越界字段直接拒绝,而不是静默应用或静默忽略。
  // 进程内调用方(如 apply_overrides)不传 method,保留全字段路径。
  if (method != null) {
    const allowed = new Set(PROP_METHOD_FIELDS[method]);
    const stray = Object.keys(props).filter((k) => !allowed.has(k));
    if (stray.length > 0) {
      throw new Error(
        `方法 ${method} 不接受字段: ${stray.join(', ')};该方法只负责 ${[...allowed].join(', ')}`,
      );
    }
  }
  let base: readonly NodeSkeleton[];
  if (params.ids != null && params.ids.length > 0) {
    base = findNode(host, params.ids);
  } else {
    base = host.currentPage.selection;
  }
  if (base.length === 0) {
    const idsHint =
      params.ids != null && params.ids.length > 0
        ? `(请求 ids: ${JSON.stringify(params.ids)})`
        : '(未传 ids,当前画布无选中)';
    throw new Error(
      `没有可修改的节点: 请先选中节点,或传入有效的 ids${idsHint};可用 jsd_find 复核节点存在与 id 有效性`,
    );
  }
  const targets = collectTargets(
    base,
    params.matchName,
    params.recursive ?? false,
    [],
    { includeSelf: params.includeSelf ?? false },
  );
  if (targets.length === 0) {
    throw new Error(
      `没有命中 matchName="${params.matchName}" 的节点(matchName 为精确匹配,需与节点 name 完全一致,非模糊搜索;可用 jsd_find 复核名称后重试)`,
    );
  }
  const warnings: string[] = [];
  // 写后反馈收集器:writer 与检查链共用同一份,避免各写一套「为什么没生效」
  const outcome: WriteOutcome = emptyOutcome();
  const baseIds = new Set(base.map((n) => n.id));
  const riskyTargets: { label: string; hint: string | null }[] = [];
  const riskyProps = new Set<string>();
  const ignoredSuperset = new Set<string>();
  const selfMutated: string[] = [];
  const selfMutatedProps = new Set<string>();
  const layoutModeMissed: string[] = [];
  // 除 layoutMode 外的回读不一致项(如 fontName)与 writer 自述告警 —— 与创建路径
  // 共用同一份文案(见 core/props/outcome.ts),不再只认 layoutMode 一个字段
  const unapplied: UnappliedProp[] = [];
  const messages: string[] = [];
  for (const node of targets) {
    // 能力门控字段:平台不具备该能力(或运行时不长这个属性)时,引擎赋值会静默跳过 → 先记下来点名
    for (const key of Object.keys(props)) {
      if (isGatedPropUnsupported(ctx, key, node)) {
        ignoredSuperset.add(key);
      }
    }
    // P26:includeSelf=true 时容器自身也在 targets 里,描边/填充会直接画在容器上
    if (
      params.recursive === true &&
      params.includeSelf === true &&
      baseIds.has(node.id)
    ) {
      const kids = 'children' in node ? (node.children?.length ?? 0) : 0;
      const hit = Object.keys(props).filter((k) =>
        CONTAINER_SELF_VISIBLE_PROPS.has(k),
      );
      if (kids > 0 && hit.length > 0) {
        selfMutated.push(`${node.name}(${node.id})`);
        for (const k of hit) selfMutatedProps.add(k);
      }
    }
    const readbackMark = outcome.readback.length;
    const messageMark = outcome.warnings.length;
    await applyProps(host, ctx, node, props, outcome);
    // P31 的方向回读现在由 layoutWriter.settle 统一做(见 core/props/writers),
    // 创建与修改两条路径共用同一份判定;压不住的结果经 outcome.readback 回收点名。
    for (const r of outcome.readback.slice(readbackMark)) {
      if (r.ok !== false) continue;
      const label = nodeLabel(node);
      if (r.key === 'layoutMode') layoutModeMissed.push(label);
      else unapplied.push({ key: r.key, label });
    }
    messages.push(...outcome.warnings.slice(messageMark));
    // 平台缺陷:实例子节点的样式覆盖回显成功但渲染不生效 → 写时点名,别让调用方以为改成了
    const instance = enclosingInstance(node);
    if (instance != null) {
      for (const key of Object.keys(props)) {
        if (INSTANCE_STYLE_RISK_PROPS.has(key)) {
          riskyProps.add(key);
          riskyTargets.push({
            label: `${node.name}(${node.id})`,
            hint: instanceStyleFixHint(instance, node),
          });
          break;
        }
      }
    }
  }
  if (riskyTargets.length > 0) {
    const sample = riskyTargets.slice(0, WARN_SAMPLE);
    const rest =
      riskyTargets.length > WARN_SAMPLE
        ? ` 等 ${riskyTargets.length} 个节点`
        : '';
    const hints = sample
      .filter((t) => t.hint != null)
      .map((t) => `${t.label} → 改 ${t.hint}`);
    warnings.push(
      [
        `实例子节点样式覆盖有平台风险:${sample.map((t) => t.label).join('、')}${rest} 位于 INSTANCE 内,`,
        '平台对实例子节点的样式覆盖不保证渲染生效(实测 fills/fontName 回显是新值但渲染仍是组件原样式)。',
        `本次改动字段:${[...riskyProps].join(', ')}。`,
        hints.length > 0
          ? `可靠改法 —— 改主组件对应子节点(所有实例一起继承):${hints.join(';')};`
          : '可靠改法 —— 改该实例的主组件对应子节点(所有实例一起继承);',
        '若只需要这一个实例不一样,先 jsd_detach_instance 把它脱离组件(变静态节点)再改;',
        '完成后用 jsd_export 导小图目检确认(回显不等于生效)。',
      ].join(''),
    );
  }
  if (selfMutated.length > 0) {
    const sample = selfMutated.slice(0, WARN_SAMPLE);
    const rest =
      selfMutated.length > WARN_SAMPLE
        ? ` 等 ${selfMutated.length} 个节点`
        : '';
    warnings.push(
      [
        `recursive + includeSelf:目标容器自身也被修改:${sample.join('、')}${rest}。`,
        '容器(FRAME/GROUP/COMPONENT/INSTANCE)自身加描边会渲染成矩形框、加填充会成底色;',
        '只想改后代就别传 includeSelf(recursive 默认只作用于后代,不含目标自身)。',
        `本次命中字段:${[...selfMutatedProps].join(', ')};完成后用 jsd_export 导小图目检。`,
      ].join(''),
    );
  }
  if (ignoredSuperset.size > 0) {
    const detail = [...ignoredSuperset]
      .map((key) => {
        const cap = CAPABILITY_OF_GATED_PROP[key];
        return cap != null ? `${key}(需 ${cap} 能力)` : key;
      })
      .join('、');
    warnings.push(
      `以下字段由平台能力门控,当前平台运行时不具备,已忽略:${detail};当前平台的能力表见 jsd_ping 的 capabilities(core 判定与该表同源,均取自 shared/dicts/capability.ts)`,
    );
  }
  if (layoutModeMissed.length > 0) {
    warnings.push(
      [
        `layoutMode 未能生效:${layoutModeMissed.join('、')} 回读后仍不是请求的方向(已重试写入一次)。`,
        '平台在布局重算后会回写容器方向,同一调用里后写的 padding/对齐/伸缩都可能把它带偏;',
        '子节点会按**回读到的**方向排布(方向错了会全叠在同一点,回显却一切正常)。',
        '处理:用 jsd_find 复核该容器的 layoutMode,再单独调一次 jsd_set_layout(只传 layoutMode)重设;',
        '设完用 jsd_export 导小图目检确认。',
      ].join(''),
    );
  }
  // 序列化提前到告警组装之前:字体判定要用**序列化后**的 fontName(引擎已落库的形态),
  // 写入时刻读到的还是原样回显,判不出「组合有没有被解析」(见 utils.fontNotResolved)。
  const updated = targets.map((n) => serializeNode(n));
  const wantFont = (props as { fontName?: unknown }).fontName as
    | { family?: unknown; style?: unknown }
    | undefined;
  if (wantFont != null) {
    for (const s of updated) {
      const why = fontNotResolved(
        wantFont,
        (s as unknown as { fontName?: unknown }).fontName,
      );
      if (why != null) {
        unapplied.push({ key: 'fontName', label: nodeLabel(s), detail: why });
      }
    }
  }
  const unappliedMsg = unappliedWarning(unapplied);
  if (unappliedMsg != null) warnings.push(unappliedMsg);
  // writer 自述类告警(WriteOutcome.warnings):0004 预留的出口,此前两条路径都没接
  warnings.push(...messages);
  return {
    updated,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
