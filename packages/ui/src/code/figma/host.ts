import type { DesignHost, NodeSkeleton } from 'text-to-design-shared';

/**
 * Figma 原生**同步**建图方法:契约自 0017 起改叫 `*Async`(MasterGo 侧只有
 * Promise 变体),Figma 这两个仍是同步 —— 差异收在本文件,不让它渗进 core。
 */
interface FigmaNativeSyncFactories {
  createNodeFromSvg(svg: string): NodeSkeleton;
  createImage(bytes: Uint8Array): { hash: string };
}

/**
 * Figma 平台 adapter:运行时 figma 全局(类型来自 @figma/plugin-typings)
 * 结构上满足 DesignHost,单点断言收窄。getLocal*Styles 为 PluginAPI 原生符号,
 * listStyles 直接经 host 读取,无需额外注入。
 *
 * 两处异步名字(契约 0017 的改名)在单点断言之外补包一层:用 `Object.create(raw)`
 * 走**原型委派**,而不是 `{...raw}` 对象展开 —— 展开会把 figma 全局的属性全部
 * 立即读出,而 `currentPage` / `viewport` 这类 getter 在插件启动早期读会抛,
 * 也与 0011「解析收口在 Access 层」的纪律相冲。被覆盖的两个键是自己的属性,
 * 其余键照旧落到运行时全局上。
 *
 * ⚠ 只覆盖 `createImageFromBytesAsync`(收字节),**不动** figma 原生的
 * `createImageAsync(src: string)` —— 后者收的是来源字符串,语义不同(见 host.ts 契约注释)。
 */
const native = figma as unknown as DesignHost & FigmaNativeSyncFactories;

export const host: DesignHost = Object.create(native, {
  createNodeFromSvgAsync: {
    value: async (svg: string): Promise<NodeSkeleton> =>
      native.createNodeFromSvg(svg),
    enumerable: true,
  },
  createImageFromBytesAsync: {
    value: async (bytes: Uint8Array): Promise<{ hash: string }> =>
      native.createImage(bytes),
    enumerable: true,
  },
});
