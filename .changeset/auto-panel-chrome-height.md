---
"text-to-design-ui": patch
"text-to-design-shared": patch
---

fix: 自适应高度下窗口底部的区块被裁掉一截（`SelectionCard` / `CapabilityCard` 下沿不可见）。`ui.resize(width, height)` 的 `height` 在三个平台都是**外框**高度，外框里含着宿主自绘的标题栏，而测量侧只发了内容高度。现把「装饰高」提升为 `ui_env` 契约成员 `chromeHeight`：**只有 MasterGo 有真源**（`ui.viewport.headerHeight`）并实现上报；Figma / jsDesign 的 typings 里没有该符号，故不实现，缺省 `0` = 不补偿（行为与改前一致）。`PanelHeightSync` 按「内容高 + 装饰高」请求，缺字段与不可信值统一走 `normalizeChromeHeight` 收成 0（见 0028）
