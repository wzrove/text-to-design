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
 */
export const meta: PlatformMeta = {
  capabilities: [
    'styles',
    'textTruncation',
    'componentProperties',
    'variables',
    'platformOps',
    'inPlaceVariants',
  ],
  platformOps: figmaOps,
};
