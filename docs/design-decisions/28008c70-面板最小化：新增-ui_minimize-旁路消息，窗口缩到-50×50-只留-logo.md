# 28008c70. 面板最小化：新增 ui_minimize 旁路消息，窗口缩到 50×50 只留 logo

- **日期：** 2026-10-21
- **状态：** 已采纳（待真机复验）
- **影响范围：** `shared/panel`、`shared/i18n`、`ui/components`、`ui/code`
- **相关记录：** 沿 0014 / 0015（同一条 `ui_resize` 旁路与测量纪律）、0028（外框 = 内容 + 装饰）

## 压力

面板占着画布一角整整 360 × 内容高。用户想让它让开时只有一条出路:整个关掉插件 ——
而关掉即断连(selection 推送、`ui_env`、daemon 通道全停),再打开要重新连。
「让开画布但不掉线」是宿主不提供的语义,只能自己造。

第二条压力在口径:最小化窗口比 `PANEL_HEIGHT_MIN`(300)还矮,而高度请求的夹取、
装饰高补偿、`PanelHeightSync` 的测量环路全都建立在那条下限与「内容高度」之上。
谁都能看出「50 不是内容高度」,问题只在**把这个例外写在哪一层**。

第三条压力是**标题栏**:窗口缩到 50 宽之后,宿主自绘标题栏里的插件名是仅剩的非 logo
内容。而改标题只有 `showUI` 的 options 有口(`UIAPI` 没有 title 成员,Figma / jsDesign
的 `ShowUIOptions.title` 是唯一入口,MasterGo 的 ShowUIOptions 根本没有这个字段)——
也就是说「清空标题」只能靠**再调一次 showUI** —— 而再次 showUI 会**重建 iframe**:Figma 的
typings 明写「旧 UI 先关闭,再显示新的」(`@figma/plugin-typings/plugin-api.d.ts:365`),
另两家的 typings 没写,按最坏情况设计。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 复用 `ui_resize` 加一个 `width`,最小化 = 发 50 | 排除 | `ui_resize` 的高度口径是「内容高度 + 装饰」且下限 300;50 是**模式尺寸**不是测量值。混在一条消息里就得在夹取处按消息内容开旁路,判定散成两处 |
| 新增 `ui_minimize{minimized}` 旁路消息 | 采用 | 消息带的是模式,尺寸由 code 侧按模式算;`isUiMinimizeMessage` 与 `isUiResizeMessage` 同层同形,UI 侧只切一个 signal |
| 面板内部折叠(窗口不动) | 排除 | 不解决「占画布」:窗口仍是 360 × 520,画布照样被挡 |
| 标题栏清空走 `showUI(title:'')` | 采用 | 唯一入口:标题不在 `UIAPI` 上;MasterGo 没有这个字段,如实只清 Figma / jsDesign |
| 标题栏清空走 `document.title` | 排除 | 标题栏文字由 showUI options / manifest name 决定,与 iframe 的 `document.title` 无关,改了大概率无效 |
| 保持简单:不做 | 排除 | 用户显式要求,且现状只有「关插件」一条出路(见压力) |

## 结论

新增 `ui_minimize` 旁路消息(与 `locale_set` / `camera_lock_set` 同族),
**模式归 UI、尺寸归 code**:UI 只说「最小化了 / 恢复了」,code 侧按模式算外框尺寸。

- 最小化:`showUI({ width: PANEL_MINIMIZED_SIZE, height: PANEL_MINIMIZED_SIZE + chrome, title: '' })` + `resize` 同尺寸;
- 恢复:`showUI({ width: PANEL_WIDTH, height: PANEL_HEIGHT_DEFAULT, title: PANEL_TITLE })` + `resize` 同尺寸,随后 `PanelHeightSync` 重新挂载并推真实内容高。
- 尺寸两条都发:`showUI` 是标题的唯一入口,`ui.resize` 是 0014 起验证过的尺寸入口 —— 谁被宿主认下都不落空。
- iframe 重建(Figma 已证实)由两层吸收:UI 按视口宽度以最小化态重启(不锁死),code 侧在 `showUI` 之后**补推启动帧**(`platform` / `ui_env` / `locale_state` / `selection`)—— 少这一层,新 UI 的 `canResize` 会停在 false,页头的最小化入口整颗消失(只能最小化一次)。

## 实施方案

- **目标形状（全量）**
  - `shared/panel.ts`:新增 `PANEL_MINIMIZED_SIZE = 50`、`UiMinimizeMessage`、`isUiMinimizeMessage`(与 `UiResizeMessage` 并列,单模块收口)。
  - `ui/code/plugin.ts`:`host.ui.onmessage` 里**先于** `isUiResizeMessage` 拦下这条(它没有 method,落到下面会回一个「未知 method」错误包);`minimized` 记在 code 侧,`ui_resize` 分支在最小化期间**整条早退** —— 高度不能落到 `clampPanelHeight` 的 300 下限(那会把 50 抬成细条),宽度也就不会弹回 360。
  - `ui/components/MinimizeToggle.tsx`(页头按钮) + `ui/components/MinimizedLogo.tsx`(50×50 视图)。
  - `ui/App.tsx`:一个 `minimized` signal 决定渲染哪一棵树;最小化时 `PanelHeightSync` **不挂载**(它的测量在 50px 窗口里没有意义,只会把请求打回内容高)。
  - `shared/core/host.ts`:`showUI` 的 options 加可选 `title`(契约层唯一改动);`ui/code/mastergo/host.ts` 显式只转 width/height —— MG 没有这个字段,如实只传尺寸,不假装清了标题。
  - `ui/code/plugin.ts` 的 `scheduleBootPushes()`:启动帧四条收在一处(状态三条 200ms + 选中 300ms),启动路径与 `applyPanelFrame()` 之后都调它 —— 重复推送幂等(`ui_env` 只覆写两个信号,`platform` 只是再触发一次能力表拉取,`locale_state` 被「用户手动选过」挡掉,`selection` 只是覆写卡片)。
  - `ui/App.tsx` 另加**重载兜底**:`minimized` 初值按视口宽度认(`innerWidth <= PANEL_MINIMIZED_SIZE + PANEL_RESIZE_STEP`)。再次 `showUI` 若在某个平台重载了 iframe,面板会以「整棵面板树 + 50px 窗口」重启 —— 那时 logo 不在、双击无从谈起,面板就锁死了;按宽度认领这一态是这条路径的唯一出路(宽度只有最小化态才不是 360)。
- **口径**
  - 高度是**内容区**口径,外框 = 50 + `chromeHeight`(同 0028:差标题栏那一截的症状是内容被裁且不报错)。
  - 恢复时的瞬时(360 × `PANEL_HEIGHT_DEFAULT`)有意接受:测量环随即收敛,与首次 `showUI` 同形。
  - 入口只在 `canResize()` 为真时挂载:宿主没有 `ui.resize` 时窗口缩不下去,挂一颗按不动的钮等于骗用户(同 0028「不拿猜测冒充事实」)。
- **本次不做**:拖动最小化窗口(窗口位置不归插件管)、最小化状态跨会话记忆、快捷键。

## 成本与退出条件

- 成本:一条旁路消息 + 一个 UI signal + 一个 code 侧布尔;两处新分支要各自守住「最小化期间不推内容高」;标题只能靠 `showUI` ⇒ **每次最小化/恢复都重建一次 iframe**(WS 重连、会话内日志清空、能力表重取),由启动帧补推 + 视口兜底吸收。这是本次形状变更最实的一笔代价 —— 不接受它,就得放弃清空标题。启动帧本身是 200/300ms 的定时单次推送,重建后 UI 若注册晚于该时刻会静默丢(与启动期同款竞态,本次不引入 UI 侧 ready 握手 —— 需要时再加)。
- 退出条件:宿主自己提供面板收起语义,或产品决定不再要这个入口 —— 删消息、删两个组件、App 里去掉 signal 即可,无残留状态。

## 验证

- 不变量测试:`packages/shared/src/__tests__/panel-minimize.test.ts` —— 守卫只认 `minimized: boolean`(脏值不当模式、不误吞同族消息),`PANEL_MINIMIZED_SIZE` 低于 `PANEL_HEIGHT_MIN`(这正是它不能走 `clampPanelHeight` 的原因)。
- 边界/重试用例:最小化期间收到 `ui_resize` 不把宽度弹回 360;恢复后 `PanelHeightSync` 重新推一次内容高;标题必须在恢复时写回 `PANEL_TITLE`,不允许「清了就回不来」。
- 平台已知 / 未知项:Figma 由 typings 证实会重建 iframe(`plugin-api.d.ts:365`);jsDesign / MasterGo 的 typings 未写,按最坏情况处理。兜底两层不依赖它:UI 按视口宽度以最小化态重启(不锁死),code 侧补推启动帧(状态回到重建前)。真机复验要专门看这两层。
- 未验证:`title: ''` 是否真把标题栏文字清空(还是回落插件名)、恢复时重设 title 是否生效 —— 无真机,typings 未写。
- 指标与日志:无新日志;`resize` 返回 void,失败只在 code 侧 console 里(与既有 `ui_resize` 一致)。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-10-21 | 初次决策 | 采用「模式归 UI、尺寸归 code」的 `ui_minimize` 旁路消息 |
| 2026-10-21 | 追加「最小化时清空宿主标题栏」 | 新增 `showUI.title` 通道(只有 Figma / jsDesign 认)+ UI 侧视口兜底 |
| 2026-10-21 | 独立验证证伪「重载未证实」 | 补 `scheduleBootPushes`(启动帧含选中,`showUI` 后无条件补推);Figma 重建 iframe 已由 typings 证实 |
