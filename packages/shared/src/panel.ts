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
 * 浮层面板展开期间的窗口高度下限(取历史默认高度,见 0015)。
 *
 * 浮层面板取窗口的 85%,而自适应布局下窗口高度 = 内容高度 —— 内容可以短到
 * `PANEL_HEIGHT_MIN`(300),那会把面板压成 255px 的矮条:扣掉它自己的头部与过滤行,
 * 只剩六行内容。展开是「浏览」不是「瞥一眼」,可用高度不该由无关内容的多少决定,
 * 故展开期间把窗口抬到这个下限。开合时窗口跳一次是有意接受的成本:它是用户显式动作,
 * 且宽度固定 360、不存在重排回环。
 */
export const PANEL_HEIGHT_OVERLAY = PANEL_HEIGHT_DEFAULT;

/**
 * 展开指示符的单点几何:`▾` 与 `▴` 在这套坐标里是**同一个字形**,只差一个竖直翻折
 * (`▾` = scaleY(-1))。所以旋转态只改 `orientation` 的值,不另给 CSS 变换 ——
 * 否则两个方向由两份样式分别表达,改一处忘另一处就是两颗对不上的箭头。
 */
export const CHEVRON_PATH = 'M6 9l6 6 6-6';
export const CHEVRON_VIEW_BOX = '0 0 24 24';
/** `▾` 为 0 度、`▴` 为 180 度 */
export const CHEVRON_ROTATION_DEG = 180;

/**
 * 自适应高度的夹取区间。
 *
 * 下限:低于它会把连接引导卡压到看不见,反而不如固定高度。
 *
 * **上限不再是「内容高度的截断点」**,这是同一条口径改过的地方:原先
 * `PANEL_HEIGHT_MAX` 同时承担「窗口别长得离谱」与「内容最多这么高」两件事,于是
 * 内容真超过 640 时被**硬砍**—— 而 `index.css` 又写死 `html, body { overflow: hidden }`
 * (断宽度重排回环用),多出来的部分既没有滚动条也够不着,内容就这么「消失」了。
 * 现在分工:窗口可以跟着内容长到 `PANEL_HEIGHT_CEILING`(宿主合理性的硬边界),
 * 真的到了边界还有内容,由根元素的 `overflow-y-auto` 接管滚动(见 0014 / App.tsx)。
 */
export const PANEL_HEIGHT_MIN = 300;

/**
 * 建议上限:内容在这个高度以内时按内容收缩。
 * 超过它窗口仍会继续长 —— 但进入「该由内部滚动承担」的区间,根元素开始出滚动条。
 */
export const PANEL_HEIGHT_MAX = 640;

/**
 * 硬边界:窗口绝不请求超过它。存在的意义是**防宿主收到荒唐值**(测量抖动、
 * 布局未收敛时的超大瞬时值),不是限制内容 —— 内容超限由滚动承担,不靠截断。
 */
export const PANEL_HEIGHT_CEILING = 1200;

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
 *
 * 上限取 `PANEL_HEIGHT_CEILING` 而非 `PANEL_HEIGHT_MAX`:后者是「建议收缩点」,
 * 拿它当截断点会让超高内容直接消失(理由见两个常量的注释)。
 */
export function clampPanelHeight(height: number): number {
  if (!Number.isFinite(height)) return PANEL_HEIGHT_DEFAULT;
  return Math.min(
    PANEL_HEIGHT_CEILING,
    Math.max(PANEL_HEIGHT_MIN, Math.ceil(height)),
  );
}

/**
 * 宿主窗口外框里「不是我们的内容」的那部分高度(标题栏)。**缺省 0 = 不补偿。**
 *
 * 为什么需要这个数:`ui.resize(width, height)` 的 `height` 在三个平台都是
 * **外框**高度(Figma / jsDesign / MasterGo 的 typings 同签名同语义),而外框里
 * 含着宿主自绘的标题栏 —— 它不进 iframe,也不由我们渲染。只看内容高度去请求,
 * 内容区就永远少掉标题栏那一截,症状是底部区块被裁,而根元素的 `overflow-y-auto`
 * (0014 修订)把它变成**静默的少一截**而不是报错。
 *
 * 为什么缺省是 0 而不是某个估出来的标题栏高度:三平台里**只有 MasterGo 暴露了**
 * 这个值(`ui.viewport.headerHeight`),Figma 与 jsDesign 的 typings 里根本没有
 * 对应符号 —— 没有真源就没有可补偿的量,编一个数只是把平台的未知换成我们的猜测
 * (换语言、换客户端版本就漂)。所以那两个平台报 0,行为与 0028 之前完全一致:
 * 差多少就让它差着,**不拿猜测冒充事实**。
 */
export const UI_CHROME_DEFAULT = 0;

/**
 * 读一个来路不明的装饰高度:可信就用,不可信(缺失 / 非数 / 负 / 荒唐大)一律当 0。
 *
 * 为什么不直接 `?? 0`:`headerHeight` 是宿主给的运行时值,可能缺失、可能是
 * `undefined`、也可能在设备像素比换算里给出非有限值或负数。荒唐值一旦进了请求,
 * 症状是窗口跳到荒唐尺寸且**没有任何报错**(`resize` 返回 void)。
 *
 * 收口放在**这一个函数**里:UI 侧有两个消费点(记录信号、测量求和),两处各写一次
 * 就是两次漂移机会;而「缺字段」是**跨版本**的常态(新 UI 配旧 code 产物)。
 */
export function normalizeChromeHeight(value: unknown): number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value < PANEL_HEIGHT_CEILING
    ? value
    : UI_CHROME_DEFAULT;
}

/** UI → code:请把面板高度改为 height(调用方已夹取) */
export interface UiResizeMessage {
  type: 'ui_resize';
  height: number;
}

/**
 * code → UI:告知宿主有没有 `ui.resize`、以及窗口外框里的装饰高占多少。
 * UI 据此二选一:有则窗口贴内容;没有则退回「选中节点吃满剩余高度」的填充布局。
 * 缺这条消息时 UI 按「没有」处理,即与历史行为一致。
 *
 * `chromeHeight` 为什么随这条走而不另开一条消息:两条消息永远同生同死(都由
 * `pushUiEnv` 在同一个时点推出),拆开只会多一个「只到了一半」的中间态要去兜。
 * 缺该字段(或值不可信)时按 `UI_CHROME_DEFAULT`(0)处理 —— 读法统一走
 * `normalizeChromeHeight`,别在消费点各写一次。
 *
 * 这条不需要判定函数:code→UI 方向本来就按 `type` 分派(selection / platform 同款);
 * 而 UI→code 的 `UiResizeMessage` 必须先于 `PluginRequest` 认出来,故配了守卫。
 */
export interface UiEnvMessage {
  type: 'ui_env';
  canResize: boolean;
  /** 宿主标题栏等装饰占的高度;**0 = 不补偿**(见 `UI_CHROME_DEFAULT`) */
  chromeHeight?: number;
}

export function isUiResizeMessage(value: unknown): value is UiResizeMessage {
  const m = value as Partial<UiResizeMessage> | null | undefined;
  return m != null && m.type === 'ui_resize' && typeof m.height === 'number';
}
