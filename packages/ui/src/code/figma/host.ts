import {
  type AssetRef,
  type DesignHost,
  fillStyleFromNode,
  type NodeSkeleton,
  type StyleCreateInit,
  type StyleDraft,
  type StyleSummary,
} from 'text-to-design-shared';

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
  /**
   * 本地变量枚举(0039):Figma 是三平台里唯一有变量读面的。
   *
   * 必须走 `variables.getLocalVariablesAsync()` —— 老入口
   * `variables.getLocalVariables()` 已废弃,且 manifest 声明 dynamic-page 时**必抛**。
   * 投影成 `AssetRef`(只留 id/name):`Variable` 的其余字段是平台形态,
   * 资源清单不需要,也不该顺带把它们带进线格式(0024 对 boundVariables 是另一种取舍:
   * 那里透传的是引擎词汇,因为它是**写入依据**)。
   */
  getLocalVariablesAsync: {
    value: async (): Promise<readonly AssetRef[]> =>
      (await figma.variables.getLocalVariablesAsync()).map((v) => ({
        id: v.id,
        name: v.name,
      })),
    enumerable: true,
  },
  /**
   * 建本地样式:引擎是「无参建空样式 + 灌值」,灌值那份逻辑与 jsDesign 共用
   * `core/styles.ts` 的 `fillStyleFromNode`(两家样式对象字段一致)。
   *
   * TEXT 类要先 `loadFontAsync` 再写排版字段,故整条走异步(契约 0010)。
   */
  createStyle: {
    value: async (init: StyleCreateInit): Promise<StyleSummary> => {
      const style =
        init.kind === 'PAINT'
          ? figma.createPaintStyle()
          : init.kind === 'TEXT'
            ? figma.createTextStyle()
            : init.kind === 'EFFECT'
              ? figma.createEffectStyle()
              : figma.createGridStyle();
      const draft = style as unknown as StyleDraft;
      await fillStyleFromNode(draft, init, (f) => figma.loadFontAsync(f));
      return { id: style.id, name: style.name, type: style.type };
    },
    enumerable: true,
  },
  /**
   * 删本地样式:取样式对象只能走 `getStyleByIdAsync` —— 同步的 `getStyleById` 在
   * dynamic-page 下必抛(0011);`Style.remove()` 本体是同步的(typings :12418)。
   */
  removeStyle: {
    value: async (id: string): Promise<void> => {
      const style = await figma.getStyleByIdAsync(id);
      if (style == null) throw new Error(`没有找到样式: ${id}`);
      style.remove();
    },
    enumerable: true,
  },
});
