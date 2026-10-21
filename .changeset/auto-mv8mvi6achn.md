---
"text-to-design-ui": minor
"text-to-design-mcp": patch
---

feat(ui): 面板最小化 —— 页头新增最小化入口,点击后窗口缩到 50×50(高度是**内容区**口径,外框另加宿主标题栏),最小化期间只显示 `logo.svg`,双击 logo 恢复原样。新增 `ui_minimize` 旁路消息(模式归 UI、尺寸归 code);宿主不支持 `ui.resize` 时不挂该入口(缩不下去的钮等于骗用户)。最小化同时清空宿主标题栏文字(`showUI` 的 `title` 选项 —— 这是标题的唯一入口;MasterGo 的 ShowUIOptions 没有该字段,如实只清 Figma / jsDesign),恢复时写回 `PANEL_TITLE`。恢复时窗口先回 `PANEL_WIDTH` × `PANEL_HEIGHT_DEFAULT`,再由 `PanelHeightSync` 重挂并推真实内容高。UI 侧另按视口宽度兜底最小化态:再次 `showUI` 若在某个平台重载 iframe,面板以最小化态重启而不是锁死。
