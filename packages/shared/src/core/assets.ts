import type { HostCapabilityKey } from '../dicts/capability';
import type { AssetRef, Assets } from '../schemas';
import {
  canReadDocumentScope,
  ensurePagesLoaded,
  listStylesAsync,
  listVariablesAsync,
} from './access';
import { hostCapabilityState } from './capabilities';
import type { DesignHost, NodeSkeleton } from './host';
import type { RuntimeContext } from './runtime';
import { normalizeVariantGroupProperties } from './variant';

/** 资源清单里的组件与变体集都从这一趟引擎过滤里分拣,类型名即桶名 */
const COMPONENT_BUCKETS = ['COMPONENT', 'COMPONENT_SET'] as const;

/**
 * **能力位 → 资源面**(0043):这几面不是「取不到就空」,而是**先看平台有没有声明**。
 *
 * 组件/变体集不在此表:`findAllWithCriteria` 三平台同构且是常规的失败可捕获调用,
 * 按平台再声明一条能力位没有收益(0022 的口径)。
 * 样式与变量必须在此表 —— 判据只有声明:即时设计四个 `getLocal*Styles` 都在,
 * 而坑在**选路**(运行时透出的 `*Async` 永不 resolve,见 access.ts),`typeof` 探测
 * 对它一律答「可以问」。
 */
const GATED_SURFACES = [
  { capability: 'styleEnumeration', surface: 'styles' },
  { capability: 'variables', surface: 'variables' },
] as const satisfies readonly {
  capability: HostCapabilityKey;
  surface: 'styles' | 'variables';
}[];

/**
 * 只读 id/name 两个字段(资源清单只需要引用得动);
 * 读不出 id 的失效节点跳过 —— 它无从被引用,而清单是概览,不该被单个坏节点扑灭。
 */
function pushRef(out: AssetRef[], node: NodeSkeleton): void {
  try {
    out.push({ id: node.id, name: node.name });
  } catch {
    // 失效节点:跳过
  }
}

/**
 * 变体集的「维度 → 可选值」。
 *
 * 读自节点上的 `variantGroupProperties`(Figma / jsDesign 的原生字段,一次属性读)。
 * MasterGo 没有这个字段(它的读法在 `mg_list_variant_properties` op 里)⇒ 返回
 * undefined,即**整个键不发** —— 与 `assets` 整块的缺席语义一致,别写成空对象
 * (空对象会被当成「确实没有维度」,那是谎话)。
 *
 * ⚠ `values` 的元素**不保证是字符串**(真机 2026-10-20,即时设计):同一台机器上
 * 单成员集合回 `["ccc"]`,两成员集合回 `[{"name":"默认"},{"name":"禁用"}]` ——
 * 后者直接撞穿输出的 `string[]` 校验,让 `get_page` 整条失败。归一收在
 * `core/variant.ts`(与 `serialize.ts` 的同一字段共用一份实现,不各写一遍)。
 */
function readVariantProperties(
  node: NodeSkeleton,
): Record<string, string[]> | undefined {
  return normalizeVariantGroupProperties(node.variantGroupProperties);
}

/** 资源清单 + 清单不完整的三类原因(都由调用方在 note 里点名,不静默吞掉) */
export type DocumentAssets = {
  assets: Assets;
  /** 枚举抛错的页:引擎的 findAll* 因坏节点整体抛,该页清单可能不全 */
  failedPages: string[];
  /** 本平台未声明对应能力位的资源面:清单恒空,不代表文档里没有 */
  unavailableSurfaces: readonly ('styles' | 'variables')[];
  /** 本平台读不到非当前页 ⇒ 清单只覆盖当前页(不是「文档只有一页」) */
  scopedToCurrentPage: boolean;
  /** 本次是否真的执行了全量页加载(0011 的成本标注来源;跨页退化为 false) */
  pagesLoaded: boolean;
};

/**
 * 设计系统资源清单(0039):组件 / 变体集 / 样式 / 变量。
 *
 * 组件与变体集走契约里**已有**的 `findAllWithCriteria`(引擎原生过滤,一次调用遍历
 * 整个文档),不是逐节点跨边界读 —— 那也是 `get_page` 原先顶穿 25s 转发预算的原因。
 * 代价是它要求文档已加载:`ensurePagesLoaded` 是 0011 的门控(dynamic-page 下读
 * 非当前页的前置),幂等,和 `getPageStructure` 共享同一次加载。
 *
 * ⚠ **跨页的前提是平台声明了 `documentScopeRead`**(2026-10-10 真机,0039 修订):
 * 未声明的平台(即时设计 / MG)触碰非当前页会直接挂到转发超时 —— 实测即时设计
 * `find scope=document` 25425ms / 25466ms / 25008ms `forward_timeout`,而当前页只要
 * 44ms。故这里按 `canReadDocumentScope(ctx)` 决定遍历**全部页**还是**只当前页**,
 * 不靠 try/catch(它是**异步**成员:`await` 永不 settle ⇒ 既 catch 不到、加超时也只是
 * 放弃这次调用)。判据用**声明**而不是 `loadAllPagesAsync` 的符号存在性:
 * 即时设计运行时有该符号且永不返回(与 dec 0042 / dec 0043 的样式枚举同一模式)。
 *
 * 四个面**都恒在**:某个面在本平台读不到就给空数组,不报错 —— 三平台能力面不对称
 * 是常态(见 0032 的三域事实表),让缺口把整条只读调用打成错误没有收益。
 *
 * 这张清单的用途是**设计前的复用判断**(见 `getPage.description` 的复用纪律):
 * 所以变体带维度取值、样式收全量四类 —— 少一样,调用方就只能靠新建绕过。
 */
export async function listDocumentAssets(
  host: DesignHost,
  ctx: RuntimeContext,
): Promise<DocumentAssets> {
  const assets: Assets = {
    summary: { components: 0, variants: 0, styles: 0, variables: 0 },
    components: [],
    variants: [],
    styles: [],
    variables: [],
  };
  const failedPages: string[] = [];

  const scopedToCurrentPage = !canReadDocumentScope(ctx);
  // 未声明文档范围读的平台连门控都不能调(它 await 的调用永不返回),见 access.ts
  const pagesLoaded = scopedToCurrentPage
    ? false
    : await ensurePagesLoaded(host);
  for (const page of scopedToCurrentPage
    ? [host.currentPage]
    : host.root.children) {
    let found: NodeSkeleton[];
    try {
      found = page.findAllWithCriteria({ types: COMPONENT_BUCKETS });
    } catch {
      // 引擎的 findAll* 会因**文档里任何一个坏节点**整体抛(实测 Figma:残留一个出错的
      // 组件集 → 整页一个节点都查不到;同 nodes.ts 的 findNodes 兜底)。这里不吞掉这件事:
      // 记下页名交给调用方在 note 里点名,同时跳过该页 —— 让一个坏节点把整条 get_page
      // 打成错误,正是这次要根治的那类问题。
      failedPages.push(page.name);
      continue;
    }
    for (const node of found) {
      if (node.type !== 'COMPONENT_SET') {
        pushRef(assets.components, node);
        continue;
      }
      const properties = readVariantProperties(node);
      try {
        assets.variants.push({
          id: node.id,
          name: node.name,
          ...(properties != null ? { properties } : {}),
        });
      } catch {
        // 失效节点:同 pushRef 的取舍
      }
    }
  }

  const unavailableSurfaces = GATED_SURFACES.filter(
    (s) => hostCapabilityState(ctx, s.capability) === false,
  ).map((s) => s.surface);

  // 样式收全量四类(PAINT / TEXT / EFFECT / GRID):复用样式是不重复造件的大头,
  // 只给颜色样式会让文字 / 效果 / 网格样式只能靠新建绕过。
  // 未声明 `styleEnumeration` 的平台一次 getter 都不调(dec 0043):问了不回答的那条路
  // (本平台是永不 resolve 的 `*Async`)会把整条 get_page 挂到 25s 超时。
  for (const style of await listStylesAsync(host, ctx)) {
    assets.styles.push({
      id: style.id,
      name: style.name,
      type: style.type as Assets['styles'][number]['type'],
    });
  }

  assets.variables = await listVariablesAsync(host, ctx);
  assets.summary = {
    components: assets.components.length,
    variants: assets.variants.length,
    styles: assets.styles.length,
    variables: assets.variables.length,
  };
  return {
    assets,
    failedPages,
    unavailableSurfaces,
    scopedToCurrentPage,
    pagesLoaded,
  };
}
