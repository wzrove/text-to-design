---
"text-to-design-mcp": patch
"text-to-design-ui": patch
---

修复 2026-11-27 线上报错与日志连接链路，新增插件功能引导与底部联系栏：

- **MCP / Core 修复**：`createSvgNode` 空节点判空防崩溃；全创建工具放行 `layoutGrow`/`layoutAlign` 并调整写入时机到 `appendChild` 之后，根治 jsDesign `appendChild` 报页面节点不存在；`getPageStructure` 跳过 `findAllWithCriteria` 中的失效节点；`jsd_create_icon` 支持 `lucide:` 优先走本地、Iconify 多域名回退与本地缓存、透出 `cause` 细节；修复 30s 心跳反复重发 `consent_set` 与版本同步刷屏、消除 `sendLogPush` 递归隐患，新增 5MB 日志轮转。
- **UI 增强**：新增 8 步可交互功能引导（支持 Design/Code 态实时预览、与错误上报首问弹窗互斥、不撑高面板）；主题切换升级为 `system → light → dark` 三态并修复 Solid 2.0 读滞后写；底部新增联系栏（GitHub / Issue 反馈 / 小红书 / QQ 群一键复制 / 悬停咖啡图标展示带 logo 的 Version 6-H 微信赞赏 SVG 二维码）。
