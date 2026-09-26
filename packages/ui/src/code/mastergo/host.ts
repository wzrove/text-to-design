import {
  type ContainerSkeleton,
  type DesignHost,
  type NodeSkeleton,
  normalizeChromeHeight,
  type PageSkeleton,
} from 'text-to-design-shared';
import { unwrapHostMessage } from './envelope';
import { summarizeStyle, unwrapNode, wrapNode } from './node-facade';

/**
 * MasterGo 平台 adapter(`mg` 全局,类型来自 `@mastergo/plugin-typings`)。
 *
 * 与 figma / jsdesign 的 `as unknown as DesignHost` **单点断言不同**,这里必须显式投影:
 * 宿主符号名/枚举值/文本属性位置/图片 paint 字段都与契约不一致,断言式收窄等于把
 * 一片幻影符号(读到 undefined、写入静默无效果)放给 core 用。逐项差异证据见 0017;
 * 差异本身收在两处:本文件(宿主层符号)+ `node-facade.ts`(节点层字段)。
 *
 * 三处需要留意的宿主层差异:
 * 1. `mg` 顶层**没有** `currentPage` / `root`,它们在 `mg.document` 下;
 * 2. 布尔/组合运算(`union` / `subtract` / `intersect` / `exclude` / `flatten` /
 *    `combineAsVariants`)**都没有 parent 参数**且 `flatten` 可返回 null —— 契约要求
 *    结果落在指定父级,故这里统一算出结果后自己 `appendChild`(否则新节点留页面根,
 *    层级与坐标都错);
 * 3. `createImage` 返回 `Image{href}`(不是 Figma 的 `{hash}`),按契约注释把 href
 *    当宿主本地图片引用交出,由门面把 paint 的 `imageHash` 翻回 `imageRef`。
 *
 * 未实现(契约里为可选,core 按运行时探测回退或用明确报错兜住):
 * `ungroup`(MG 两级 API 都没有)、`getNodeByIdAsync` / `loadAllPagesAsync` /
 * `setCurrentPageAsync` / `getLocal*StylesAsync`(MG 无 dynamic-page,同步 getter 即全部)、
 * 节点级 `getMainComponentAsync`(只有同步 `mainComponent`)、`variantGroupProperties`、
 * `removeOverrides`、`absolutePosition`。
 */

/** 结果落到指定父级(MG 的组合 API 不接 parent,契约要求落点明确) */
function appendTo<T extends NodeSkeleton>(
  result: T,
  parent: ContainerSkeleton,
): T {
  const rawParent = unwrapNode(parent) as {
    appendChild?(child: unknown): void;
  };
  if (typeof rawParent.appendChild === 'function') {
    rawParent.appendChild(unwrapNode(result));
  }
  return result;
}

function toRawNodes(nodes: readonly NodeSkeleton[]): unknown[] {
  return nodes.map((n) => unwrapNode(n));
}

export const host: DesignHost = {
  createFrame: () => wrapNode(mg.createFrame()),
  createRectangle: () => wrapNode(mg.createRectangle()),
  createEllipse: () => wrapNode(mg.createEllipse()),
  createText: () => wrapNode(mg.createText()),
  createLine: () => wrapNode(mg.createLine()),
  createPolygon: () => wrapNode(mg.createPolygon()),
  createStar: () => wrapNode(mg.createStar()),
  // MG 的矢量节点叫 PEN(类型名也是 'PEN'),门面把它翻回契约的 VECTOR
  createVector: () => wrapNode(mg.createPen()),
  createComponent: () => wrapNode(mg.createComponent()),
  createNodeFromSvgAsync: async (svg: string) =>
    wrapNode(await mg.createNodeFromSvgAsync(svg)),
  createImageFromBytesAsync: async (bytes: Uint8Array) => {
    const image = await mg.createImage(bytes);
    return { hash: image.href };
  },

  // 宿主层差异 1:currentPage / root 都挂在 mg.document 下,且是 getter ——
  // 必须用 getter 转发(用户在客户端里切页/加页后要读到当下值,不能缓存)
  get currentPage() {
    return wrapNode(mg.document.currentPage) as unknown as PageSkeleton;
  },
  get root() {
    return {
      get children(): readonly PageSkeleton[] {
        return mg.document.children.map(
          (page) => wrapNode(page) as unknown as PageSkeleton,
        );
      },
    };
  },
  get viewport() {
    return {
      get center() {
        return mg.viewport.center;
      },
      scrollAndZoomIntoView(nodes: readonly NodeSkeleton[]) {
        mg.viewport.scrollAndZoomIntoView(
          toRawNodes(nodes) as Parameters<
            typeof mg.viewport.scrollAndZoomIntoView
          >[0],
        );
      },
    };
  },

  // 宿主层差异 2:无 parent 参数,结果由 appendTo 自己落到目标父级
  union: (nodes, parent) =>
    appendTo(wrapNode(mg.union(toRawNodes(nodes) as never)), parent),
  subtract: (nodes, parent) =>
    appendTo(wrapNode(mg.subtract(toRawNodes(nodes) as never)), parent),
  intersect: (nodes, parent) =>
    appendTo(wrapNode(mg.intersect(toRawNodes(nodes) as never)), parent),
  exclude: (nodes, parent) =>
    appendTo(wrapNode(mg.exclude(toRawNodes(nodes) as never)), parent),
  flatten: (nodes, parent) => {
    const result = mg.flatten(toRawNodes(nodes) as never);
    // 可返回 null(typings 声明),契约没有「空结果」这一形态 —— 明确报错,不静默返回空
    if (result == null) {
      // i18n-exempt: 随错误包上行给模型,不走面板文案
      throw new Error('flatten 未产出节点(MasterGo 返回 null)');
    }
    return appendTo(wrapNode(result), parent);
  },
  combineAsVariants: (nodes, parent) =>
    appendTo(
      wrapNode(mg.combineAsVariants(toRawNodes(nodes) as never)),
      parent,
    ),
  importComponentByKeyAsync: async (key: string) =>
    wrapNode(await mg.importComponentByKeyAsync(key)),

  getNodeById: (id: string) => {
    const node = mg.getNodeById(id);
    return node == null ? null : wrapNode(node);
  },
  loadFontAsync: async (font) => {
    await mg.loadFontAsync(font);
  },
  listAvailableFontsAsync: async () => {
    const fonts = await mg.listAvailableFontsAsync();
    return fonts.map((f) => ({ fontName: f.fontName }));
  },

  showUI: (html: string, options: { width?: number; height?: number }) => {
    mg.showUI(html, options);
  },
  getLocalPaintStyles: () => mg.getLocalPaintStyles().map(summarizeStyle),
  getLocalTextStyles: () => mg.getLocalTextStyles().map(summarizeStyle),
  getLocalEffectStyles: () => mg.getLocalEffectStyles().map(summarizeStyle),
  getLocalGridStyles: () => mg.getLocalGridStyles().map(summarizeStyle),

  on: (event: string, handler: (...args: unknown[]) => void) => {
    // 宿主的事件名是联合类型、回调参数按事件各异(selectionchange 给的是 id 数组),
    // 契约只要求「能订阅」—— 收窄发生在这里,调用方(plugin.ts)只做推送
    mg.on(
      event as PluginEventType,
      handler as unknown as MGEventCallbackMap[PluginEventType],
    );
  },
  get clientStorage() {
    return mg.clientStorage;
  },
  ui: {
    postMessage: (message: unknown) => {
      mg.ui.postMessage(message, '*');
    },
    get onmessage() {
      return mg.ui.onmessage as ((message: unknown) => void) | null;
    },
    set onmessage(handler: ((message: unknown) => void) | null) {
      // MasterGo 不拆 `pluginMessage` 信封(见 envelope.ts 的实测症状),
      // 而 UI 侧统一按 Figma 约定发带信封的消息 —— 拆包在这里收口。
      // 宿主类型只接受 undefined(不接受 null),契约侧的空值在这里换算
      mg.ui.onmessage =
        handler == null
          ? undefined
          : (raw: unknown) => {
              handler(unwrapHostMessage(raw));
            };
    },
    // `ui.resize` **条件挂载**:契约明确要求判据是 `typeof host.ui.resize === 'function'`
    // (缺符号不算错,插件外壳据此告诉 UI 改走「选中节点吃满剩余高度」的降级布局)。
    // 无条件声明会让 `canResize` 恒真 —— 宿主真没有该符号时,UI 一开日志抽屉就是 TypeError。
    ...(typeof mg.ui.resize === 'function'
      ? {
          resize: (width: number, height: number) => {
            mg.ui.resize(width, height);
          },
        }
      : {}),
    /**
     * 三平台里**只有 MG 有**这个符号(`UIViewport.headerHeight`)，是本条链路唯一的
     * 真源 —— Figma / jsDesign 的 typings 里没有对应符号，那两个适配器因此**不实现
     * 本方法**（缺省即 0 = 不补偿，见 `UI_CHROME_DEFAULT`），不拿猜测冒充事实。
     *
     * 读法必须经可选链 + 可信性判定：该 viewport 是运行时对象，插件启动早期读可能
     * 拿不到（同本仓对 `currentPage` / `viewport` 那类 getter 的一贯顾虑）；
     * 拿不到或值荒唐时 `normalizeChromeHeight` 收成 0 —— 面板少补偿几像素顶多是
     * 留白，不该崩，也不该让宿主给的值原样冲进请求。
     */
    chromeHeight: () => normalizeChromeHeight(mg.ui.viewport?.headerHeight),
  },
};
