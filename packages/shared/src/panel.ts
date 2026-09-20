/**
 * 面板尺寸契约:插件 UI ↔ 插件 code 共用的尺寸常量与「自改高度」旁路消息。
 *
 * 为什么单独成模块(理由同 connection.ts):面板高度有三个落点 —— code 侧
 * `showUI` 的初值、UI 侧测量后的夹取、以及两侧对同一条消息的理解。散在各自文件里
 * 就会漂移,而漂移的症状是「窗口比内容差几像素」这种没人会去查的小错。
 *
 * 为什么是**旁路消息**而不是 `PluginRequest`:那条契约是给 MCP 工具用的
 * (schema 是唯一真源、且会进工具目录)。改高度不过 MCP、没有外部调用方,
 * 混进去等于凭空多出一个 MCP 工具。
 */

/** 面板宽度:内容排版按它定,不参与自适应 */
export const PANEL_WIDTH = 360;

/**
 * `showUI` 的初始高度。自适应生效时它只是个起点(首帧后即收敛到内容高);
 * 宿主不支持 `ui.resize` 时它就是最终高度,故与历史值保持一致。
 */
export const PANEL_HEIGHT_DEFAULT = 520;

/**
 * 自适应高度的夹取区间。
 * 下限:低于它会把连接引导卡压到看不见,反而不如固定高度。
 * 上限:超过它「贴合内容」就失去意义了 —— 那说明内容真的多,该由内部滚动承担。
 */
export const PANEL_HEIGHT_MIN = 300;
export const PANEL_HEIGHT_MAX = 640;

/**
 * 改高度的发送阈值。测量值带小数,且任何一次回流都会改变 `offsetHeight`;
 * 不设阈值时窗口会在边框拖拽与亚像素抖动下持续收到 resize 请求。
 */
export const PANEL_RESIZE_STEP = 8;

/**
 * 亚像素余量。请求高度必须**不小于**内容高度。
 *
 * 为什么差一点点都不行:窗口只要比内容矮,视口就长出滚动条 → 内容可用宽度少
 * 几个像素(本项目 `::-webkit-scrollbar` 定宽 4px,是占位的经典滚动条)→ 中文
 * 重排 → 内容变高 → 再请求更大的高度 → 滚动条消失 → 宽度回来 → 内容变矮 →
 * 又比内容矮 …… 这条回环的症状就是面板持续抖动。
 * 宁可多给 1px(同色,看不见),也不让滚动条有机会出现。
 */
export const PANEL_HEIGHT_SLACK = 1;

/**
 * 把测量值夹进区间并向上取整。
 *
 * 取整方向是有意的:四舍五入会给出**比内容矮**的值(content=344.4 → 344),
 * 那正是上面那条回环的起点。向上取整让请求永远偏大(多出来的是同色空白)。
 */
export function clampPanelHeight(height: number): number {
  if (!Number.isFinite(height)) return PANEL_HEIGHT_DEFAULT;
  return Math.min(
    PANEL_HEIGHT_MAX,
    Math.max(PANEL_HEIGHT_MIN, Math.ceil(height)),
  );
}

/** UI → code:请把面板高度改为 height(调用方已夹取) */
export interface UiResizeMessage {
  type: 'ui_resize';
  height: number;
}

/**
 * code → UI:告知宿主有没有 `ui.resize`。
 * UI 据此二选一:有则窗口贴内容;没有则退回「选中节点吃满剩余高度」的填充布局。
 * 缺这条消息时 UI 按「没有」处理,即与历史行为一致。
 *
 * 这条不需要判定函数:code→UI 方向本来就按 `type` 分派(selection / platform 同款);
 * 而 UI→code 的 `UiResizeMessage` 必须先于 `PluginRequest` 认出来,故配了守卫。
 */
export interface UiEnvMessage {
  type: 'ui_env';
  canResize: boolean;
}

export function isUiResizeMessage(value: unknown): value is UiResizeMessage {
  const m = value as Partial<UiResizeMessage> | null | undefined;
  return m != null && m.type === 'ui_resize' && typeof m.height === 'number';
}
