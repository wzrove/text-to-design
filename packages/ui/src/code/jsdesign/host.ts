import {
  type DesignHost,
  fillStyleFromNode,
  type NodeSkeleton,
  type StyleCreateInit,
  type StyleDraft,
  type StyleSummary,
} from 'text-to-design-shared';

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
  /**
   * 建本地样式:与 figma/host.ts 同形(引擎的样式对象字段一致),灌值同样复用
   * `core/styles.ts` 的 `fillStyleFromNode`,不在此重写第二份。
   */
  createStyle: {
    value: async (init: StyleCreateInit): Promise<StyleSummary> => {
      const style =
        init.kind === 'PAINT'
          ? jsDesign.createPaintStyle()
          : init.kind === 'TEXT'
            ? jsDesign.createTextStyle()
            : init.kind === 'EFFECT'
              ? jsDesign.createEffectStyle()
              : jsDesign.createGridStyle();
      await fillStyleFromNode(style as unknown as StyleDraft, init, (f) =>
        jsDesign.loadFontAsync(f),
      );
      return { id: style.id, name: style.name, type: style.type };
    },
    enumerable: true,
  },
  /**
   * 合并为变体:**必须显式以全局为 receiver 调**。
   *
   * `host` 是 `Object.create(native)`,原型链上取到的原生方法被调用时 `this` 是
   * **host 这个代理对象**而不是 `jsDesign` 全局。其它建图方法不受影响(不读 `this`),
   * 但 `combineAsVariants` 曾疑似因此炸出 `in get_name / in get_booleanOperation:
   * Value is not a string`。**已真机排除(2026-10-20)**:把 receiver 钉回全局后报错逐字相同,
   * 且与组件命名、是否带子层、是否在 FRAME 里都无关 ⇒ 是引擎实现缺陷,不是调用方式。
   * 保留这层显式绑定:它才是 `jsDesign.combineAsVariants(...)` 的正确形状,别退回原型链。
   */
  combineAsVariants: {
    value: (nodes: readonly NodeSkeleton[], parent: NodeSkeleton): NodeSkeleton =>
      native.combineAsVariants(nodes, parent as never),
    enumerable: true,
  },
  /**
   * 删本地样式:本平台没有 dynamic-page,同步 `getStyleById` 就是官方入口
   * (`plugin-api.d.ts:50`),`Style.remove()` 同步(`:1143`)。
   */
  removeStyle: {
    value: async (id: string): Promise<void> => {
      const style = jsDesign.getStyleById(id);
      if (style == null) throw new Error(`没有找到样式: ${id}`);
      style.remove();
    },
    enumerable: true,
  },
});
