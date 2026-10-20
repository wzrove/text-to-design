import {
  normalizeVariantGroupProperties,
  normalizeVariantProperties,
  type PlatformOp,
} from 'text-to-design-shared';
import { z } from 'zod';

/**
 * 即时设计的**只读组件面**:按官方文档 + typings 1.0.12 的字段逐项回读。
 *
 * 为什么值得单开一个 op:组件/变体这三类节点上有若干字段**契约里没有对应成员**
 * (实例数、发布 key / remote、可发布描述、实例缩放比、变体集默认变体与成员),
 * 而它们正好回答调用方最常问的两件事 —— 「改这个组件会影响多少实例」「这是不是
 * 团队库来的、发布了没有」。三页文档与 typings 在这三项上**逐字一致**
 * (2026-10-20 核对 js.design/developer-doc/plugin/api/node/{ComponentNode,InstanceNode,ComponentSetNode}),
 * 故这里不引入新事实,只把已声明的字段透出来。
 *
 * ⚠ getPublishStatusAsync 单列为**可选**(withPublishStatus):本平台有「typings 声明的
 * async 成员永不 settle」的先例(getMainComponentAsync、四个 getLocal*StylesAsync,
 * 见 dec 0010 / dec e1e66f0a),这条没验过,不给默认路径踩。
 */
const factsSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1)
    .max(50)
    .describe('组件 / 实例 / 变体集节点 id(其它类型也会回 type,字段按类型给)'),
  withInstances: z
    .boolean()
    .optional()
    .describe('COMPONENT:是否连实例 id 一起回(默认只回数量),上限 200 条'),
  withPublishStatus: z
    .boolean()
    .optional()
    .describe(
      '是否调 getPublishStatusAsync(默认 false —— 本平台有 async 成员永不 settle 的先例,这条未验)',
    ),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe(
      '可选:写回可发布节点(COMPONENT / COMPONENT_SET)的 description 并回读校验',
    ),
});

interface PublishableNode {
  description?: string;
  remote?: boolean;
  key?: string;
  expanded?: boolean;
  getPublishStatusAsync?: () => Promise<unknown>;
}

interface FactsParams {
  withInstances?: boolean;
  withPublishStatus?: boolean;
  description?: string;
}

function publishableFacts(p: PublishableNode): Record<string, unknown> {
  return {
    ...(p.description != null ? { description: p.description } : {}),
    ...(typeof p.remote === 'boolean' ? { remote: p.remote } : {}),
    ...(typeof p.key === 'string' ? { key: p.key } : {}),
    ...(typeof p.expanded === 'boolean' ? { expanded: p.expanded } : {}),
  };
}

/**
 * 发布状态:本平台 `PublishStatus` 只有 UNPUBLISHED / CURRENT / CHANGED 三值,但真机
 * (2026-10-20)对**非团队库节点**回的是**错误串** `Failed to get node publish status`
 * (21ms 返回,不是永挂 —— 这条 async 成员可用,与 `getMainComponentAsync` 不同)。
 * 故不把任意字符串塞进 publishStatus:三值才认,其余单列 publishStatusError,
 * 免得调用方把一句错误当状态。
 */
const PUBLISH_STATUSES = ['UNPUBLISHED', 'CURRENT', 'CHANGED'] as const;

async function publishStatusOf(
  p: PublishableNode,
  withPublishStatus: boolean | undefined,
): Promise<Record<string, unknown>> {
  if (!withPublishStatus || typeof p.getPublishStatusAsync !== 'function')
    return {};
  const raw = await p.getPublishStatusAsync();
  if (
    typeof raw === 'string' &&
    (PUBLISH_STATUSES as readonly string[]).includes(raw)
  ) {
    return { publishStatus: raw };
  }
  return { publishStatusError: typeof raw === 'string' ? raw : String(raw) };
}

async function componentFacts(
  node: BaseNode,
  params: FactsParams,
): Promise<Record<string, unknown>> {
  const base: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
  };
  if (
    params.description != null &&
    (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET')
  ) {
    const pub = node as unknown as PublishableNode;
    pub.description = params.description;
    base.descriptionWritten = pub.description ?? null;
  }
  if (node.type === 'COMPONENT') {
    const n = node as ComponentNode;
    const pub = n as unknown as PublishableNode;
    const instances = n.instances ?? [];
    return {
      ...base,
      ...publishableFacts(pub),
      instanceCount: instances.length,
      ...(params.withInstances
        ? { instanceIds: instances.slice(0, 200).map((i) => i.id) }
        : {}),
      childCount: n.children.length,
      ...(await publishStatusOf(pub, params.withPublishStatus)),
    };
  }
  if (node.type === 'COMPONENT_SET') {
    const n = node as ComponentSetNode;
    const pub = n as unknown as PublishableNode;
    // 文档口径:变体是引用组件的集合、子节点都是 ComponentNode、defaultVariant 是
    // ComponentNode(空间上最左上角那个成员)。**真机 2026-10-20 与文档不符的两处**:
    // ① defaultVariant 实测是 **FRAME**(13:87),不是 COMPONENT;
    // ② 子节点里也确实混着一个 FRAME(其余才是 COMPONENT)。
    // 故这里按**实测类型**回报(defaultVariantType / members[].type),不按文档假设过滤。
    // 另:集合级 dimension 名与成员的 variantProperties 键**可能对不上**(实测集合是
    // 「分类 1 / xx / ttt」,成员却是「分类1 / 分类2 / 分类3」),值则都是字符串 ——
    // 对不上就单列 dimensionMismatch,免得调用方拿集合的键去 setProperties 却打不中。
    const members = n.children.map((c) => {
      const member = c as unknown as {
        id: string;
        name: string;
        type: string;
        variantProperties?: Record<string, unknown> | null;
      };
      const vp = normalizeVariantProperties(member.variantProperties);
      return {
        id: member.id,
        name: member.name,
        type: member.type,
        ...(vp != null ? { variantProperties: vp } : {}),
      };
    });
    // 归一与投影共用 core 的实现:集合维度与成员取值是同一个维度的两张表,
    // 各写一遍迟早早一起漂(真机 2026-10-20:values 元素是 {name} 对象)
    const dimensions = normalizeVariantGroupProperties(
      n.variantGroupProperties,
    );
    const setKeys = Object.keys(dimensions ?? {});
    const memberKeys = [
      ...new Set(
        members.flatMap((m) => Object.keys(m.variantProperties ?? {})),
      ),
    ];
    const setOnlyKeys = setKeys.filter((k) => !memberKeys.includes(k));
    const memberOnlyKeys = memberKeys.filter((k) => !setKeys.includes(k));
    const dimensionMismatch =
      setOnlyKeys.length > 0 || memberOnlyKeys.length > 0;
    return {
      ...base,
      ...publishableFacts(pub),
      defaultVariantId: n.defaultVariant?.id ?? null,
      defaultVariantName: n.defaultVariant?.name ?? null,
      defaultVariantType: n.defaultVariant?.type ?? null,
      ...(dimensions != null
        ? {
            variantGroupProperties: Object.fromEntries(
              Object.entries(dimensions).map(([k, values]) => [k, { values }]),
            ),
          }
        : {}),
      members,
      ...(dimensionMismatch
        ? {
            dimensionMismatch: {
              setKeys,
              memberKeys,
              setOnlyKeys,
              memberOnlyKeys,
            },
            warnings: [
              `集合级变体维度(${setKeys.join('、')})与成员 variantProperties 的键(${memberKeys.join('、')})不是同一套 —— 引擎写实例只认**成员键**;切变体时传成员键(core 会按取值自动映射集合维度键,见 jsd_set_instance_properties)`,
            ],
          }
        : {}),
      ...(await publishStatusOf(pub, params.withPublishStatus)),
    };
  }
  if (node.type === 'INSTANCE') {
    const n = node as InstanceNode;
    const raw = n as unknown as Record<string, unknown>;
    return {
      ...base,
      mainComponentId: n.mainComponent?.id ?? null,
      scaleFactor: n.scaleFactor,
      // 真机 2026-10-20:typings/文档都声明了 InstanceNode.setProperties(:1093),但运行期调它
      // 立刻炸 "in setProperties: i.setProperties is not a function" —— 与 componentProperties
      // 缺席同族(声明不等于实现)。这里直接把**符号在不在**回报出去,调用方不必再拿一次失败试探。
      setPropertiesAvailable: typeof raw.setProperties === 'function',
      swapComponentAvailable: typeof raw.swapComponent === 'function',
      ...publishableFacts(n as unknown as PublishableNode),
      childCount: n.children.length,
    };
  }
  return {
    ...base,
    note: '不是 COMPONENT / COMPONENT_SET / INSTANCE,只回基础字段',
  };
}

const factsOp: PlatformOp = {
  name: 'jsd_component_facts',
  title: '组件类节点的文档字段回读',
  description:
    '即时设计特有:按官方文档(ComponentNode / InstanceNode / ComponentSetNode)回读**契约里没有对应成员**的字段。params: { ids, withInstances?, withPublishStatus?, description? }。按类型给 —— COMPONENT: instanceCount / childCount / description / remote / key / expanded(带 withInstances 还回 instanceIds);COMPONENT_SET: defaultVariantId / variantGroupProperties / members(成分 id+name+type,此前只能靠 assets.variants 猜) / 发布字段;INSTANCE: mainComponentId / scaleFactor / 发布字段。传 description 会对 COMPONENT / COMPONENT_SET 写回并回读(descriptionWritten)。⚠ getPublishStatusAsync 只在 withPublishStatus:true 时调 —— 本平台有「typings 声明的 async 成员永不 settle」的先例(dec e1e66f0a),这条没验过;若传了 25s 超时,说明它也是那种成员,别放进默认路径',
  inputSchema: factsSchema,
  async run(_host, params) {
    const p = params as FactsParams & { ids: string[] };
    const facts: Record<string, unknown>[] = [];
    const failed: { id: string; reason: string }[] = [];
    for (const id of p.ids) {
      try {
        const node = jsDesign.getNodeById(id);
        if (node == null) {
          failed.push({ id, reason: '没有找到该节点' });
          continue;
        }
        facts.push(await componentFacts(node, p));
      } catch (e) {
        failed.push({ id, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    return { facts, ...(failed.length > 0 ? { failed } : {}) };
  },
};

export const jsdesignOps: PlatformOp[] = [factsOp];
