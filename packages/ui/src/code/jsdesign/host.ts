import {
  type DesignHost,
  fillStyleFromNode,
  type NodeSkeleton,
  type StyleCreateInit,
  type StyleDraft,
  type StyleSummary,
} from 'text-to-design-shared';

/**
 * jsDesign 原生**同步**建图方法:typings 1.0.12 全部是同步
 * (`plugin-api.d.ts:118 createNodeFromSvg(svg): FrameNode`、`:121 createImage(data)`)。
 *
 * `createNodeFromSvg` 已不再被本文件包成 `*Async`:契约把它改成同步必需
 * (见 shared/core/host.ts),原生同步符号直接落到设计主机契约上,DOM 里不再有
 * 一层 async 边界 —— 即时设计运行时**透出**的异步成员可能永不 settle(dec e1e66f0a)。
 */
interface JsDesignNativeSyncFactories {
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
 *
 * `createNodeFromSvg` 不再被包成 `*Async`:契约已把它改成同步必需(shared/core/host.ts),
 * 原生同步符号(`plugin-api.d.ts:118`)直接满足,经原型委派即可。
 * 反向由 `sync-guarantee.ts` 的 HostGapCheck 守着 —— `createNodeFromSvgAsync` 仍在
 * JsDesignAsyncNameGap 里登记,意味着本文件不该、也不该再包这个名字。
 */
const native = jsDesign as unknown as DesignHost & JsDesignNativeSyncFactories;

export const host: DesignHost = Object.create(native, {
  // 同步原生符号直接满足契约(见 shared/core/host.ts):这里不在外面再包一层 async,
  // 即时设计运行时**透出**的异步成员可能永不 settle(dec e1e66f0a)。原型委派够用 ——
  // 与 createImageFromBytesAsync 同一条链,无需自己的属性。
  createNodeFromSvg: {
    // 原生回 FrameNode,契约的 NodeSkeleton 是它的窄化超集 —— 与其它建图方法同一种单点断言
    value: (svg: string): NodeSkeleton =>
      jsDesign.createNodeFromSvg(svg) as unknown as NodeSkeleton,
    enumerable: true,
  },
  createImageFromBytesAsync: {
    value: async (bytes: Uint8Array): Promise<{ hash: string }> =>
      native.createImage(bytes),
    enumerable: true,
  },
  /**
   * 解组:typings 两级都没有该符号,运行时全局的 `ungroup(children)` 只收**数组**
   * (传单节点报 `First argument to ungroup() must be an array`,真机错误组
   * `jsd_ungroup_nodes {code:engine_error}`)。契约收整批节点,这里原样下发。
   */
  ungroup: {
    value: (nodes: readonly NodeSkeleton[]): readonly NodeSkeleton[] =>
      (
        native as unknown as {
          ungroup(nodes: readonly NodeSkeleton[]): readonly NodeSkeleton[];
        }
      ).ungroup(nodes) ?? [],
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
    value: (
      nodes: readonly NodeSkeleton[],
      parent: NodeSkeleton,
    ): NodeSkeleton => native.combineAsVariants(nodes, parent as never),
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
