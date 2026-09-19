import type {
  ComponentPropertyValue,
  SerializedNode,
  UpdateNodeProps,
} from '../schemas';
import { hostCapabilityState } from './capabilities';
import { type DesignHost, MIXED, type NodeSkeleton } from './host';
import type { RuntimeContext } from './runtime';
import { serializeNode } from './serialize';
import { updateSelection } from './update';
import { findNode } from './utils';

export function createComponentNodes(
  host: DesignHost,
  params: { ids: string[]; name?: string },
): { created: SerializedNode } {
  const nodes = findNode(host, params.ids);
  if (nodes.length === 0) {
    throw new Error('没有找到要固化为组件的节点');
  }
  // 只建空壳组件:不要 appendChild 已有节点(会触发引擎卷进 wrapper,
  // 后续删 wrapper 连坐删子树并残留 dangling,影响整图序列化)。
  // 子节点由调用方用 reparent 归组进来。
  const component = host.createComponent();
  component.name = params.name ?? 'component';
  host.viewport.scrollAndZoomIntoView([component]);
  return { created: serializeNode(component) };
}

export function createInstances(
  host: DesignHost,
  ids: string[],
): { created: SerializedNode[] } {
  const nodes = findNode(host, ids);
  const components = nodes.filter((n) => n.type === 'COMPONENT');
  if (components.length === 0) {
    // 逐 id 点名:没找到的与类型不符的分开说,别让调用方猜是哪个 id 为什么不行
    const details = ids
      .map((id) => {
        const found = findNode(host, [id]);
        return found.length === 0
          ? `${id}:未找到(可能已删除或不在当前页)`
          : `${id}:类型为 ${found[0].type}(可实例化的只有 COMPONENT)`;
      })
      .join(';');
    throw new Error(`没有找到可实例化的组件节点。${details}`);
  }
  const page = host.currentPage;
  const created: NodeSkeleton[] = [];
  const center = host.viewport.center;
  for (const c of components) {
    const inst = c.createInstance();
    page.appendChild(inst);
    inst.x = center.x - inst.width / 2;
    inst.y = center.y - inst.height / 2;
    created.push(inst);
  }
  host.viewport.scrollAndZoomIntoView(created);
  return { created: created.map((n) => serializeNode(n)) };
}

export function swapComponents(
  host: DesignHost,
  params: { ids: string[]; componentId: string },
): { swapped: SerializedNode[] } {
  const component = findNode(host, [params.componentId]).find(
    (n) => n.type === 'COMPONENT',
  );
  if (!component) {
    throw new Error(`没有找到组件: ${params.componentId}`);
  }
  const instances = findNode(host, params.ids).filter(
    (n) => n.type === 'INSTANCE',
  );
  if (instances.length === 0) {
    throw new Error('没有找到要交换的实例节点');
  }
  for (const inst of instances) {
    inst.swapComponent(component);
  }
  return { swapped: instances.map((n) => serializeNode(n)) };
}

export function setInstanceProperties(
  host: DesignHost,
  params: { ids: string[]; properties: Record<string, string> },
): { updated: SerializedNode[] } {
  const instances = findNode(host, params.ids).filter(
    (n) => n.type === 'INSTANCE',
  );
  if (instances.length === 0) {
    throw new Error('没有找到要设置的实例节点');
  }
  // 运行时校验:属性名必须属于实例的合法变体属性
  for (const inst of instances) {
    const compSet = inst.mainComponent?.parent;
    const variantProps =
      compSet != null && compSet.type === 'COMPONENT_SET'
        ? compSet.variantGroupProperties
        : undefined;
    if (variantProps) {
      const validKeys = Object.keys(variantProps);
      const invalidKeys = Object.keys(params.properties).filter(
        (k) => !validKeys.includes(k),
      );
      if (invalidKeys.length > 0) {
        throw new Error(
          `非法变体属性:${invalidKeys.join(',')}。合法属性:${validKeys.join(',')}`,
        );
      }
    }
    inst.setProperties(params.properties);
  }
  return { updated: instances.map((n) => serializeNode(n)) };
}

export async function importComponentNodes(
  host: DesignHost,
  params: { key: string; name?: string },
): Promise<{ created: SerializedNode }> {
  const component = await host.importComponentByKeyAsync(params.key);
  const page = host.currentPage;
  page.appendChild(component);
  const center = host.viewport.center;
  component.x = center.x - component.width / 2;
  component.y = center.y - component.height / 2;
  if (params.name != null) component.name = params.name;
  host.viewport.scrollAndZoomIntoView([component]);
  return { created: serializeNode(component) };
}

export function combineAsVariantsNodes(
  host: DesignHost,
  ctx: RuntimeContext,
  params: { ids: string[]; name?: string },
): { created: SerializedNode } {
  const components = findNode(host, params.ids).filter(
    (n) => n.type === 'COMPONENT',
  );
  if (components.length < 2) {
    throw new Error('combine_as_variants 至少需要 2 个组件节点');
  }
  const page = host.currentPage;
  const errText = (e: unknown): string =>
    e instanceof Error ? e.message : String(e);

  // 引擎 combineAsVariants 实测存在内部崩溃(get_booleanOperation: Value is not
  // a string),这里把三种姿势做成「按平台能力排序的尝试列表」,全部失败时汇总报错。
  //
  // **平台差异(这正是两平台行为不同的根源)**:
  // - Figma 的原生 combineAsVariants 就是**原位合并** —— 并入集合的就是实例所指的
  //   那些 COMPONENT 本身,已有实例链接不断;克隆姿势在它上面纯属副作用(留下
  //   「原件 + 集合内克隆」两份,实例继续指向原件,变体集与实例脱钩)。
  // - jsDesign 没有这个语义(该路径必然崩),只能靠克隆兜底。
  //
  // 故声明了 inPlaceVariants 能力的平台优先走原位,其余保持历史顺序(克隆优先)。
  let set: NodeSkeleton | undefined;
  const errors: string[] = [];

  // 原位合并:原组件被卷入组件集、不再单独存在。唯一不破坏实例链接的姿势。
  const combineInPlace = (): NodeSkeleton | undefined => {
    const s = host.combineAsVariants(components, components[0].parent ?? page);
    if (params.name != null && s != null) s.name = params.name;
    if (s != null) serializeNode(s); // 探活:任何引擎 getter 抛都归本姿势
    return s ?? undefined;
  };

  // 克隆后合并:原组件保留。jsDesign 上 host.combineAsVariants 可能返回一个
  // 非空 set,但任何对它的属性访问(set.name / 后续 serializeNode)都会触发引擎内部
  // getter 崩(get_booleanOperation / get_name: Value is not a string)。该崩不在
  // 调用内部抛出,一路冒到 plugin 外层 try,把引擎原文回给调用方,富出口文案错过。
  // 修法:把 name 赋值 + serializeNode 都纳入同一个 try,任何姿势中间崩都重置 set
  // 为 undefined,错误归并到 errors[];全部姿势失败时统一抛富出口文案。
  const combineClones =
    (appendToPage: boolean) => (): NodeSkeleton | undefined => {
      const clones = components.map((c) => c.clone());
      try {
        if (appendToPage) for (const c of clones) page.appendChild(c);
        const s = host.combineAsVariants(clones, page);
        if (params.name != null && s != null) s.name = params.name;
        if (s != null) serializeNode(s);
        return s ?? undefined;
      } catch (e) {
        for (const c of clones) {
          try {
            c.remove();
          } catch {
            // 半途被引擎卷走/已失效,忽略
          }
        }
        throw e;
      }
    };

  const inPlaceAttempt = { label: '原节点直接合并(原位)', run: combineInPlace };
  const cloneToPageAttempt = {
    label: '克隆并入当前页',
    run: combineClones(true),
  };
  const cloneThenCombineAttempt = {
    label: '克隆移入当前页后合并',
    run: combineClones(false),
  };
  // 能力表未注入(null)时不猜平台语义,保持历史顺序(行为与绑定前一致)
  const supportsInPlace = hostCapabilityState(ctx, 'inPlaceVariants') === true;
  const attempts = supportsInPlace
    ? [inPlaceAttempt, cloneToPageAttempt, cloneThenCombineAttempt]
    : [cloneToPageAttempt, cloneThenCombineAttempt, inPlaceAttempt];

  for (const attempt of attempts) {
    try {
      set = attempt.run();
    } catch (e) {
      errors.push(`${attempt.label}: ${errText(e)}`);
      set = undefined;
    }
    if (set != null) break;
  }

  // name 已在各姿势的 try 内赋值并跟同姿势一起作废处理,这里无需再设。
  if (set == null) {
    const names = components.map((c) => `${c.name}(${c.id})`).join('、');
    if (supportsInPlace) {
      // 平台声明了原位合并能力却仍全败:与 jsDesign 的 不是一回事,先按调用
      // 与节点状态排查 —— 别让调用方套用「引擎做不出来」的结论去改组件结构。
      throw new Error(
        [
          'combine_as_variants 失败:本平台声明支持原位合并(inPlaceVariants),三种姿势仍全败,按调用与节点状态排查(不要套用 jsDesign 的结论)。',
          `引擎报错:${errors.join(';')}。`,
          `本次涉及的组件:${names}。`,
          '排查方向:①组件是否跨页 / 跨父级;②是否已被并入别的组件集;③组件是否处于错误状态(可先 jsd_repair_nodes 清理);④组件名是否符合「属性=值」、多属性用 ", " 分隔。',
        ].join(''),
      );
    }
    // 平台缺陷:本引擎版本的 combineAsVariants 在合并路径里把节点按
    // BOOLEAN_OPERATION 取属性(get_booleanOperation: Value is not a string),
    // 与组件结构无关、克隆兜底路径同样必败(实测三个同尺寸同层级的合规 COMPONENT
    // 同样必败)。所以这里不能只回一句「失败」—— 那是让人反复重试、怀疑组件
    // 结构的信号;直接把可执行出口写在报错里。
    throw new Error(
      [
        `combine_as_variants 三种姿势均失败:本引擎版本的变体集做不出来(平台缺陷,建议附下面的报错上报)。`,
        `引擎报错:${errors.join(';')}。`,
        `本次涉及的组件:${names}。`,
        '不要在结构上找原因,也别重试(合规组件同样必败)。',
        '可执行出口:①每个状态各做一个独立 COMPONENT,按「族名 / 状态」命名(如 Nav / Face-to-Face、Nav / Inbox、Nav / Me),调用方按名字取用;',
        '②确需变体语义时在画布上手工合并,或换到支持该能力的引擎(如 Figma)执行。',
        '⚠ 「一个主件 + 每屏改子节点颜色」这条捷径同样不通:实例子节点的样式 override 平台不保证渲染生效(见平台缺陷),多状态只能靠多主件。',
      ].join(''),
    );
  }
  host.viewport.scrollAndZoomIntoView([set]);
  return { created: serializeNode(set) };
}

/** mainComponent 可安全触碰(读属性不崩)才算活着;僵尸引用会让引擎解绑时内部崩溃 */
function mainComponentAlive(n: NodeSkeleton): boolean {
  try {
    const main = n.mainComponent;
    return main != null && typeof main.id === 'string';
  } catch {
    return false;
  }
}

/**
 * jsDesign 引擎 detachInstance 偶发内部崩溃(t.get is not a function),
 * 多见于被 setProperties/swapComponent 改过覆盖的原节点。副本兜底:
 * 克隆到原位(引擎侧干净状态)解绑副本,删原实例,几何不变。
 */
function detachWithRecovery(inst: NodeSkeleton): NodeSkeleton {
  let firstMsg = '';
  try {
    return inst.detachInstance();
  } catch (firstErr) {
    firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
  }
  // 副本兜底:克隆插回原位(引擎侧干净状态)再解绑,成功后删原实例
  let clone: NodeSkeleton | undefined;
  try {
    const parent = inst.parent;
    if (!parent) throw new Error('实例无父节点,副本无处安放');
    const index =
      'children' in parent
        ? (parent.children ?? []).findIndex((c) => c.id === inst.id)
        : -1;
    clone = inst.clone();
    if (index >= 0 && 'insertChild' in parent) {
      parent.insertChild(index, clone);
    } else {
      parent.appendChild(clone);
    }
    const frame = clone.detachInstance();
    clone = undefined; // 已转为 frame,不再清理
    inst.remove();
    return frame;
  } catch (retryErr) {
    // 半途而废时删掉克隆,避免画布残留重复实例
    try {
      clone?.remove();
    } catch {
      // 已被移除或引擎级损坏,忽略
    }
    const retryMsg =
      retryErr instanceof Error ? retryErr.message : String(retryErr);
    throw new Error(
      `实例 ${inst.id} 解绑失败(直接:${firstMsg};副本兜底:${retryMsg})。可尝试先 repair,或在画布中选中后用快捷键 Ctrl/⌘+Alt+B 手动分离`,
    );
  }
}

// detachWithRecovery 不需要 host:克隆先插回原父级再解绑
export function detachInstanceNodes(
  host: DesignHost,
  ids: string[],
): {
  created: SerializedNode[];
  failed: { id: string; message: string }[];
} {
  const instances = findNode(host, ids).filter((n) => n.type === 'INSTANCE');
  if (instances.length === 0) {
    throw new Error('没有找到要解绑的实例节点');
  }
  const detached: NodeSkeleton[] = [];
  const failed: { id: string; message: string }[] = [];
  for (const inst of instances) {
    if (!mainComponentAlive(inst)) {
      failed.push({
        id: inst.id,
        message:
          'mainComponent 已失效,无法解绑。建议先运行 repair 清理失效节点',
      });
      continue;
    }
    try {
      detached.push(detachWithRecovery(inst));
    } catch (e) {
      failed.push({
        id: inst.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  if (detached.length === 0 && failed.length > 0) {
    throw new Error(
      `全部实例解绑失败:${failed.map((f) => `${f.id}(${f.message})`).join(', ')}`,
    );
  }
  if (detached.length > 0) {
    host.viewport.scrollAndZoomIntoView(detached);
  }
  return { created: detached.map((n) => serializeNode(n)), failed };
}

// ---- 实例覆盖复制/套用(对齐参考实现的 get/set_instance_overrides) ----

/** 实例覆盖快照:插件进程内缓存,不落 MCP 线格式(仅摘要回传模型) */
export interface OverrideSnapshot {
  sourceId: string;
  sourceName: string;
  /** 源组件的 COMPONENT 节点 id:swapToSource 在源实例被删后仍可定位组件 */
  mainComponentId?: string;
  /** 变体属性(跨平台) */
  variantProperties?: Record<string, string>;
  /** Figma 组件属性(仅该平台存在,in 守卫天然跳过其他平台) */
  componentProperties?: Record<string, ComponentPropertyValue>;
  /** 可见属性子集(fills/文本/圆角/效果/描边等,不含几何与命名) */
  props?: UpdateNodeProps;
}

/** 复制结果的摘要(只回传键名,不回传大体积值) */
export interface OverrideSummary {
  variantProperties?: Record<string, string>;
  componentProperties?: Record<string, ComponentPropertyValue>;
  propsSummary?: string[];
}

/** 单实例套用结果 */
export interface AppliedOverride {
  instanceId: string;
  instanceName: string;
  ok: boolean;
  message?: string;
}

/** 插件侧缓存:copy 覆盖同 key;上限 20 条逐出最旧;插件进程重启即清空 */
const OVERRIDE_CACHE_MAX = 20;
const overrideCache = new Map<string, OverrideSnapshot>();

export function getCachedOverride(
  sourceId: string,
): OverrideSnapshot | undefined {
  return overrideCache.get(sourceId);
}

function cachePut(snapshot: OverrideSnapshot): void {
  overrideCache.set(snapshot.sourceId, snapshot);
  if (overrideCache.size > OVERRIDE_CACHE_MAX) {
    const oldest = overrideCache.keys().next().value;
    if (oldest != null) overrideCache.delete(oldest);
  }
}

function toSummary(snapshot: OverrideSnapshot): OverrideSummary {
  return {
    ...(snapshot.variantProperties != null
      ? { variantProperties: snapshot.variantProperties }
      : {}),
    ...(snapshot.componentProperties != null
      ? { componentProperties: snapshot.componentProperties }
      : {}),
    ...(snapshot.props != null
      ? { propsSummary: Object.keys(snapshot.props) }
      : {}),
  };
}

/** 从实例采集可见属性子集:只同步样式/文本,不动位置与命名 */
function captureVisibleProps(node: NodeSkeleton): UpdateNodeProps | undefined {
  const props: Record<string, unknown> = {};
  if (node.type === 'TEXT') {
    if (node.characters != null) props.characters = node.characters;
    if (node.fontSize != null && node.fontSize !== MIXED)
      props.fontSize = node.fontSize;
    if (node.fontName != null && node.fontName !== MIXED)
      props.fontName = node.fontName;
  }
  if ('fills' in node && Array.isArray(node.fills)) props.fills = node.fills;
  if ('effects' in node && Array.isArray(node.effects))
    props.effects = node.effects;
  if (node.strokeWeight != null) props.strokeWeight = node.strokeWeight;
  if (node.strokeAlign != null) props.strokeAlign = node.strokeAlign;
  if (node.blendMode != null) props.blendMode = node.blendMode;
  if (typeof node.opacity === 'number') props.opacity = node.opacity;
  if (node.cornerRadius != null) props.cornerRadius = node.cornerRadius;
  if (node.topLeftRadius != null) props.topLeftRadius = node.topLeftRadius;
  if (node.topRightRadius != null) props.topRightRadius = node.topRightRadius;
  if (node.bottomLeftRadius != null)
    props.bottomLeftRadius = node.bottomLeftRadius;
  if (node.bottomRightRadius != null)
    props.bottomRightRadius = node.bottomRightRadius;
  return Object.keys(props).length > 0 ? (props as UpdateNodeProps) : undefined;
}

function captureOverrideSnapshot(
  host: DesignHost,
  sourceId: string,
  includeVisibleProps: boolean,
): OverrideSnapshot {
  const source = findNode(host, [sourceId]).find((n) => n.type === 'INSTANCE');
  if (!source) {
    throw new Error(`没有找到源实例: ${sourceId}`);
  }
  if (!source.mainComponent) {
    throw new Error(
      `源实例 ${sourceId} 的 mainComponent 已失效,无法复制覆盖。建议先 jsd_manage_nodes op=repair 清理后重试`,
    );
  }
  const snapshot: OverrideSnapshot = {
    sourceId,
    sourceName: source.name,
    mainComponentId: source.mainComponent.id,
    ...(source.variantProperties != null &&
    Object.keys(source.variantProperties).length > 0
      ? { variantProperties: { ...source.variantProperties } }
      : {}),
    ...('componentProperties' in source &&
    source.componentProperties != null &&
    Object.keys(source.componentProperties).length > 0
      ? { componentProperties: { ...source.componentProperties } }
      : {}),
    ...(includeVisibleProps ? { props: captureVisibleProps(source) } : {}),
  };
  return snapshot;
}

/** 把快照套用到目标实例:可选 swap → 变体/组件属性 → 可见属性。逐条 try/catch */
async function applyOverrideSnapshot(
  host: DesignHost,
  ctx: RuntimeContext,
  snapshot: OverrideSnapshot,
  ids: string[],
  swapToSource: boolean,
): Promise<{
  applied: AppliedOverride[];
  total: number;
  source: OverrideSummary;
}> {
  const applied: AppliedOverride[] = [];
  for (const targetId of ids) {
    try {
      const target = findNode(host, [targetId]).find(
        (n) => n.type === 'INSTANCE',
      );
      if (!target) {
        applied.push({
          instanceId: targetId,
          instanceName: '',
          ok: false,
          message: '实例不存在或已失效',
        });
        continue;
      }
      if (swapToSource && snapshot.mainComponentId != null) {
        const main = findNode(host, [snapshot.mainComponentId]).find(
          (n) => n.type === 'COMPONENT',
        );
        if (!main) {
          applied.push({
            instanceId: targetId,
            instanceName: target.name,
            ok: false,
            message: '源组件已失效,无法 swapToSource',
          });
          continue;
        }
        target.swapComponent(main);
      }
      // Figma 有 componentProperties 时走部分更新(整体赋值会重置其余属性且新版只读);
      // 否则(jsDesign)走跨平台变体属性。两者都经 setProperties 部分更新语义合并。
      if (
        snapshot.componentProperties != null &&
        Object.keys(snapshot.componentProperties).length > 0
      ) {
        // 只带 {type, value} 的部分更新:整体赋值会重置其余属性且新版 API 只读
        const patch: Record<string, ComponentPropertyValue> = {};
        for (const [k, v] of Object.entries(snapshot.componentProperties)) {
          patch[k] = { type: v.type, value: v.value };
        }
        target.setProperties(patch);
      } else if (
        snapshot.variantProperties != null &&
        Object.keys(snapshot.variantProperties).length > 0
      ) {
        target.setProperties(snapshot.variantProperties);
      }
      if (snapshot.props != null && Object.keys(snapshot.props).length > 0) {
        // 复用 updateSelection:含 TEXT 的 loadFont 等边界处理
        await updateSelection(host, ctx, {
          ids: [targetId],
          props: snapshot.props,
        });
      }
      applied.push({
        instanceId: targetId,
        instanceName: target.name,
        ok: true,
      });
    } catch (e) {
      applied.push({
        instanceId: targetId,
        instanceName: '',
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  const failed = applied.filter((r) => !r.ok);
  if (failed.length === applied.length && applied.length > 0) {
    throw new Error(
      `全部实例套用失败:${failed
        .map((f) => `${f.instanceId}(${f.message ?? '未知错误'})`)
        .join(', ')}`,
    );
  }
  return { applied, total: ids.length, source: toSummary(snapshot) };
}

/** 无状态一次性「复制+套用」:不写缓存,适合 jsd_batch 流水 */
export async function syncInstanceOverrides(
  host: DesignHost,
  ctx: RuntimeContext,
  params: {
    sourceId: string;
    ids: string[];
    includeVisibleProps?: boolean;
    swapToSource?: boolean;
  },
): Promise<{
  applied: AppliedOverride[];
  total: number;
  source: OverrideSummary;
}> {
  const snapshot = captureOverrideSnapshot(
    host,
    params.sourceId,
    params.includeVisibleProps !== false,
  );
  return applyOverrideSnapshot(
    host,
    ctx,
    snapshot,
    params.ids,
    params.swapToSource ?? false,
  );
}

/** 两段式第一段:复制源实例覆盖为快照,写入插件侧缓存,返回摘要 + snapshotId(=sourceId) */
export function copyInstanceOverrides(
  host: DesignHost,
  params: { sourceId: string; includeVisibleProps?: boolean },
): {
  snapshotId: string;
  sourceName: string;
  captured: OverrideSummary;
} {
  const snapshot = captureOverrideSnapshot(
    host,
    params.sourceId,
    params.includeVisibleProps !== false,
  );
  cachePut(snapshot);
  return {
    snapshotId: snapshot.sourceId,
    sourceName: snapshot.sourceName,
    captured: toSummary(snapshot),
  };
}

/** 两段式第二段:按 sourceId 从缓存取快照套用到目标实例;miss 报错提示先 copy */
export async function applyCachedOverrides(
  host: DesignHost,
  ctx: RuntimeContext,
  params: { sourceId: string; ids: string[]; swapToSource?: boolean },
): Promise<{
  applied: AppliedOverride[];
  total: number;
  source: OverrideSummary;
}> {
  const snapshot = overrideCache.get(params.sourceId);
  if (!snapshot) {
    throw new Error(
      `缓存中没有 ${params.sourceId} 的覆盖快照,请先调用 jsd_manage_components op=copy_overrides`,
    );
  }
  return applyOverrideSnapshot(
    host,
    ctx,
    snapshot,
    params.ids,
    params.swapToSource ?? false,
  );
}
