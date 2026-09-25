import type { DesignHost, NodeSkeleton } from 'text-to-design-shared';

/**
 * jsDesign 原生**同步**建图方法:契约自 0017 起改叫 `*Async`(MasterGo 侧只有
 * Promise 变体),jsDesign 这两个仍是同步 —— 差异收在本文件,不让它渗进 core。
 */
interface JsDesignNativeSyncFactories {
  createNodeFromSvg(svg: string): NodeSkeleton;
  createImage(bytes: Uint8Array): { hash: string };
}

/**
 * jsDesign 平台 adapter:运行时 jsDesign 全局(类型来自
 * @jsdesigndeveloper/plugin-typings)结构上满足 DesignHost,单点断言收窄。
 * getLocal*Styles 为 PluginAPI 原生符号,listStyles 直接经 host 读取。
 *
 * 与 figma/host.ts 镜像对称(含 0017 的两处异步名字包装与 `Object.create` 原型委派,
 * 理由见那边注释):展开对象会把宿主全局的属性全部立即读出,启动早期读会抛。
 *
 * ⚠ 只覆盖 `createImageFromBytesAsync`(收字节),**不动** jsDesign 原生的
 * `createImageAsync(src: string)`(收来源字符串,语义不同,见 core/host.ts 契约注释);
 * 原生同步的 `createImage(data: Uint8Array): Image` 才是本契约要包的那个。
 */
const native = jsDesign as unknown as DesignHost & JsDesignNativeSyncFactories;

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
