import type { PlatformMeta } from 'text-to-design-shared';
import { figmaOps } from './ops';

/**
 * Figma 能力面。
 *
 * manifest 已启用 `documentAccess: "dynamic-page"`(见 scripts/vite-plugin-manifest.ts,
 * 决策 0011):文档访问一律走异步入口(getNodeByIdAsync / getMainComponentAsync /
 * getLocal*StylesAsync),core 的解析收口在 shared/core/access.ts。
 *
 * `inPlaceVariants`:Figma 的 `figma.combineAsVariants` 就是**原位合并** ——
 * 并入组件集的是实例所指的那些 COMPONENT 本身,已有实例链接不断、页面不残留
 * 冗余原件。core 的 combine_as_variants 据此把「原位」提到首选姿势(jsDesign
 * 没有这个语义,保持克隆兜底顺序)。
 *
 * 不声明 `platformOps` 能力位(0029):「本平台有 op 通道」这件事由下面的
 * `platformOps` 数组**本身**表达,再挂一个能力位就是同一事实的第二份载体,
 * 且 MG 侧会立刻出现「有 5 个 op 却不 claim」的自相矛盾。
 */
export const meta: PlatformMeta = {
  capabilities: [
    'styles',
    'styleEnumeration',
    // 文档范围读(0039 修订):Figma 有 dynamic-page 与 `loadAllPagesAsync` 且真的会
    // 返回 ⇒ 跨页遍历、资源清单与 pages 元数据都覆盖全文档。另两平台不声明。
    'documentScopeRead',
    'textTruncation',
    'componentProperties',
    'variables',
    'inPlaceVariants',
  ],
  platformOps: figmaOps,
};
