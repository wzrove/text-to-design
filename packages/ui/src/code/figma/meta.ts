import type { PlatformMeta } from 'text-to-design-shared';
import { figmaOps } from './ops';

/**
 * Figma 能力面。
 *
 * 注意:能力表只列**调用方能实际用上**的项。Figma typings 虽有
 * `InstanceNode.getMainComponentAsync`,但本仓 manifest 走 legacy documentAccess
 * (见 scripts/vite-plugin-manifest.ts,为保同步 API 可用),core 用同步
 * `mainComponent`,该异步 API 零调用 —— 已从能力枚举移除,避免模型以为有异步通路。
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
