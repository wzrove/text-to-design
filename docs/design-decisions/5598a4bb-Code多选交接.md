# 5598a4bb. 三平台 Mode 多选与节点引用 Copy

- **日期：** 2026-11-17（Asia/Hong_Kong）
- **状态：** 已采纳
- **实施状态：** 已实现；当前 Copy 仅返回一个 jsd:// 节点引用 URL。
- **影响范围：** ui、shared、mcp-server
- **相关记录：** 取代 [d1728d17](d1728d17-Code-Copy交接.md)；不恢复 [40bf4e19](40bf4e19-Code模式以会话配置组合接入：复用画布链路与宿主代码能力.md) 的会话/工作区架构。

## 压力与决策演进

初始决策确认三平台、前后端多选和 LLM 按项目生成脚本。随后用户要求 Copy 必须经 MCP 工具，不得由 UI/插件缓存或拼装 design JSON，因此引入 jsd_copy 和轻量选择摘要。

最新需求进一步否定 Copy 时拼接长任务文本：当前选中节点后，剪贴板应只有可稳定定位节点的 URL。详情、上下文和实际处理由 LLM 与 skill 后移完成。UI 同时保持单按钮“复制”，不恢复原始 JSON 入口。

## 候选与排除

| 候选 | 结论 | 理由 |
| --- | --- | --- |
| jsd://node/{id} + jsd://canvas/selection 查询引用 | 采用 | 沿用项目资源词汇，固定 IDs，内容极短且可严格解析 |
| CopyEnvelope / 角色提示 / depth snapshot | 排除 | 复制文本过大，职责与上下文应后移给 skill |
| design 返回 legacy JSON、Code 返回任务包 | 排除 | 最新要求所有 Mode 都只返回节点引用 |
| UI 直接生成链接 | 排除 | 仍须统一经 jsd_copy，保持上一项 MCP 链路决策 |
| Copy 时 find 验证并读取详情 | 排除 | 违反详情后移要求；失效由后续 skill 处理 |
| 新增文档身份数据库或会话控制 | 排除 | 不属于定位链接必要字段，不扩大范围 |

## 结论

所有 Copy 按钮调用 jsd_copy，返回且仅返回一个 jsd:// URL。单节点沿用 jsd://node/{id}，整组使用 jsd://canvas/selection 加重复 id 参数。共同字段为 v=1、mode、platform、page、可选 seq；code 另含固定顺序 roles 和 skill=design-to-code。

URL 不含节点名称、样式、文本、JSON、职责说明或 pageContext。UI 不直接生成，仍经 MCP executor。design 同样只返回 URL，不再提供原始 JSON 能力。

后续 LLM 使用 shared parseNodeReference 或等价严格规则解析，code 加载 design-to-code，按 requestedIds 调 jsd_find。带参数 URL 同时注册 resources/read 模板：selection 使用 {+query} 以兼容重复 id，node 沿用既有模板；资源按 IDs 分批读取。节点失效、缺失和平台差异在后续处理；不拿当前 selection 或名称匹配替代。

顶部与节点行继续各只保留一个“复制”按钮。Code 下前端/后端多选不变，checkbox 与模式控件同一行展示；未选职责仍禁用复制，但移除额外提示文案。

## 实施与验证

- shared 提供 CopyRequest/Result、buildNodeReference、parseNodeReference 和静态 skill 路由。
- mcp-server 的 jsd_copy 只构造 URL，不调用 find/ping/get_page；daemon WS 继续复用 executor。
- design-to-code 与 jsd://code 改为 URL 识别、固定 IDs 补读、失效处理和职责路由。
- 删除 CopyEnvelope、提示片段、角色化快照实现及旧测试。
- 新增 URL 往返、异常输入、工具不读画布、真实 tools/call 和带参数 resources/read 测试。

仓库规则禁止本轮运行 test/build；2026-11-17 pnpm run typecheck、决策引用检查、git diff --check 和最终复制路径审计均通过。三平台真机验收另行执行。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
| --- | --- | --- |
| 2026-11-17 | 三平台、前后端多选、LLM 生成脚本和项目栈决策 | 保留多选与宿主执行边界，不恢复会话架构 |
| 2026-11-17 | Copy 必须经 MCP 工具按 mode/roles 获取内容 | 轻量摘要 + jsd_copy，取代 UI 缓存组包 |
| 2026-11-17 | 简化 Mode/Copy UI | 单按钮“复制”，移除 Code 原始 JSON/ID 次级入口 |
| 2026-11-17 | Copy 改为极简节点 URL | 所有 Mode 仅返回引用；删除任务包和 design JSON，详情后移给 skill |
| 2026-11-17 | Code 职责选项与模式控件同行并删除未选提示 | 保留 roles 空值禁用校验，不改变 URL Copy 或其他交互 |
