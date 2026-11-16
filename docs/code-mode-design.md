# Mode 与节点引用 Copy 设计

状态：**已实现**。覆盖即时设计（jsdesign）、Figma（figma）、MasterGo（mastergo）。当前 Copy 只生成一个 jsd:// 节点引用 URL；不再生成任务说明、职责摘要、CopyEnvelope、JSON 或页面上下文。

当前决策见 [5598a4bb](design-decisions/5598a4bb-Code多选交接.md)。最新需求取代早期“Copy 时实时读取并组装设计任务包”的方案；节点详情、项目上下文和实际处理全部后移给 LLM 与 design-to-code skill。

## 1. 范围与交互

- 顶部“设计 | Code”和 Code 下“前端 / 后端”多选保持现有交互；选中 Code 后，两个方形小圆角职责 checkbox 与模式控件同一行对齐。
- 首次进入 Code 不自动选职责；未选职责时仍禁用复制，但不显示额外提示文案。
- 顶部复制当前全部显式选中根；节点行只复制该根。两处都只有一个文案为“复制”的按钮。
- 不新增入口，不恢复原始 JSON 或节点 ID 的次级复制能力。design 模式同样只返回 URL，不返回 legacy JSON。
- mode/roles 只写入引用并决定后续 skill 路由，不预设技术栈，不扩大宿主权限。
- Copy 仍必须通过 jsd_copy MCP 工具；UI/插件不读取、缓存或拼装 design JSON。

## 2. 模块划分

| 模块 | 文件 | 职责 |
| --- | --- | --- |
| 轻量选择帧 | `packages/ui/src/code/plugin.ts` | selectionchange 仅推 id/name/type/width/height、pageName 和 meta |
| 入站摘要收窄 | `packages/ui/src/bridge/router.ts` | 即使旧端推完整 selection，也只保留轻量摘要 |
| 单按钮 UI | `packages/ui/src/components/SelectionCard.tsx` | 保存 mode/roles；点击时冻结 CopyRequest；仅接收 URL 写剪贴板 |
| WS 适配 | `packages/mcp-server/src/bridge.ts`、`packages/mcp-server/src/daemon/run.ts` | WS 仅传输；lookupExecutor('jsd_copy') 复用 MCP 执行体 |
| Copy 工具 | `packages/mcp-server/src/tools/copy.ts` | 校验请求并返回一个节点引用 URL；不调用 find/ping/get_page |
| URL 契约 | `packages/shared/src/node-reference.ts`、`packages/shared/src/schemas/copy.ts` | URL 构造、严格解析、CopyRequest/Result 和摘要 schema |
| 静态路由 | `packages/shared/src/dicts/node-reference.ts` | roles、URL 版本、design-to-code skill 路由 |
| 后续处理 | `packages/mcp-server/src/skills/design-to-code` | 解析链接、按 IDs 补读、按 roles 实现和验证 |
| 普通资源回退 | `packages/mcp-server/src/tools/code-resources.ts` | jsd://code 同源提供 skill 与附录，不执行脚本 |

## 3. 核心流程

### 3.1 Copy

~~~text
selectionchange
  → 插件轻量摘要
  → UI 选中列表

点击“复制”
  → 同步冻结 mode、roles、scope、requestedIds、platform/page/seq
  → UI WS 调 jsd_copy
  → buildNodeReference 校验并生成一个 URL
  → CopyResult {text:url}
  → UI 等待剪贴板真实结果并 toast
~~~

Copy 工具不访问画布正文。节点是否存在不由 Copy 假装验证；后续 skill 按 ID 读取时发现失效并报告。

### 3.2 后续 LLM / skill

~~~text
粘贴 URL
  → parseNodeReference 严格解析
  → code 时加载 design-to-code + data-contract + 对应 roles 附录
  → 核对 platform/page 与实际连接
  → 按 requestedIds 调 jsd_find
  → 缺失 ID 明确报错；有效目标再展开结构、样式、资源和项目上下文
  → 按前端/后端/双端职责实现与验证
~~~

带参数链接可直接经 resources/read 展开：整组由 jsd://canvas/selection{+query} 模板匹配，单节点沿用 jsd://node/{id} 模板。资源按链接 IDs 分批 find，缺失即报错；无参数 jsd://canvas/selection 仍表示当前选中，不得用它替代固定 IDs。skill 也可直接调 jsd_find。

## 4. URL 接口与数据结构

### 4.1 单节点示例

~~~text
jsd://node/1%3A1?v=1&mode=design&platform=figma&page=%E7%99%BB%E5%BD%95%E9%A1%B5&seq=7
~~~

Code 单节点另含 roles 和 skill：

~~~text
jsd://node/1%3A1?v=1&mode=code&roles=frontend&skill=design-to-code&platform=figma&page=%E7%99%BB%E5%BD%95%E9%A1%B5&seq=7
~~~

### 4.2 整组示例

~~~text
jsd://canvas/selection?v=1&mode=code&roles=frontend%2Cbackend&skill=design-to-code&platform=figma&page=%E7%99%BB%E5%BD%95%E9%A1%B5&seq=7&id=1%3A1&id=1%3A2
~~~

### 4.3 字段

| 字段 | 规则 |
| --- | --- |
| 协议/路径 | 单节点 jsd://node/{id}；整组 jsd://canvas/selection |
| v | 当前固定 1 |
| mode | design 或 code |
| roles | code 必填，frontend/backend 去重并按此顺序，逗号连接；design 禁止 |
| skill | code 固定 design-to-code；design 禁止 |
| platform | jsdesign/figma/mastergo，必填 |
| page | 页面名，必填并 URL 编码 |
| seq | 可选正整数，选择帧序号，不是设计版本 |
| id | 单节点在路径；整组为重复 id 参数，保持选择顺序且不得重复 |

复制文本必须且只能包含该 URL：无空格、说明、Markdown 围栏、JSON 或第二个链接。节点名称、尺寸、文本、样式和资源均不进入链接。

platform+page+requestedIds 提供当前设计客户端内的稳定定位线索。项目没有文档唯一 ID 约定，因此不声称跨文档全局唯一；明显不符时由 skill 要求确认或重新 Copy。

### 4.4 CopyRequest / CopyResult

CopyRequest 仅含：

- mode、code 时的 roles；
- scope=selection/node；
- 非空去重 requestedIds；node 必须一个；
- source.platform/pageName/selectionSeq。

CopyResult 为 `{text:string}`，text 只能是合法节点引用 URL。请求不包含节点正文、名称摘要、styles、children、pageContext、本机路径或凭据。

## 5. 解析与异常处理

| 情况 | 处理 |
| --- | --- |
| 未选节点、无效 ID、Code 未选 roles | UI 禁用复制；校验规则不变，不显示额外提示 |
| 缺 platform 或 page | jsd_copy 报错，不生成弱定位链接 |
| 空角色、未知角色、重复 requestedIds、node 多 ID | schema/构造器明确报错 |
| 非 jsd 协议、错误路径/版本、未知字段、非法编码 | parseNodeReference 拒绝 |
| 重复单值字段、重复 id、错误 roles 顺序 | parseNodeReference 拒绝 |
| 链接含说明、空白、JSON 或多个 URL | parseNodeReference 拒绝 |
| 节点删除、失效或 ID 未返回 | 后续 jsd_find 列具体缺失；不替换名称、不用当前 selection、不静默丢目标 |
| MCP 断线 | 新 Copy 失败；已有链接仍保留目标引用，但无法补读时明确缺项 |
| 剪贴板失败 | 按真实异步结果提示，不声称复制成功 |

## 6. Skills 与后续数据读取

- code 链接加载 design-to-code 和 data-contract。
- frontend 加载 frontend；backend 加载 backend；双选再加 integration。
- 仅后端通常 find(depth=1)，不强制视觉资源；仅前端/双选通常 find(depth=2)，按需 get_page 和导出资源。
- find 顶层最多 100 个，后续读取分批；childCount 深层子树另设数量、字节和时间限制。
- 节点失效、默认省略、mixed、unreadable、unresolved 按 data-contract 处理，不猜默认值。
- 宿主读取现有项目栈、组件/服务约定、API 和业务规则后实现；脚本按需生成并由宿主审阅、执行和验证。
- jsd://code 与 skills 正文同源，仅作只读回退，不是执行 API。

## 7. 使用说明

1. 构建并加载新插件产物，构建并重启 daemon，让宿主重新连接。
2. 选择节点，保持 design 或切到 Code 并选择职责。
3. 顶部“复制”引用全部选中根；节点行“复制”只引用该根。
4. 粘贴给 AI。AI 先解析链接并加载相应 skill，再获取节点详情和项目上下文。
5. 复制成功仅表示 URL 已写入剪贴板，不表示节点已补读、代码已生成或验证已完成。

## 8. 测试与验证

- `packages/shared/src/__tests__/node-reference.test.ts`：三平台、单节点/整组、roles、URL 往返、不可变文本、缺字段、无选择、非法链接和重复参数。
- `packages/mcp-server/src/__tests__/copy-tool.test.ts`：工具不读画布、单 URL、节点失效不替换、真实 MCP tools/call 和缺定位字段错误。
- `packages/mcp-server/src/__tests__/node-reference-resource.test.ts`：整组/单节点 resources/read、角色 depth、100+ IDs、失效目标和无参数资源兼容。
- `packages/mcp-server/src/__tests__/code-skill.test.ts`：skill 版本、附录引用和路径安全。
- `packages/mcp-server/src/__tests__/code-resource.test.ts`：资源索引、同源正文与离线读取。
- `packages/ui/src/utils/clipboard.test.ts`：异步剪贴板真实结果。

仓库规则要求不运行 test/build；测试已交付但未执行。2026-11-17 pnpm run typecheck 全仓通过，决策引用检查为 60 条记录、92 处 dec 标注、0 未解析，git diff --check 通过；最终复制路径审计确认工具无 find/ping/get_page、UI 无原始复制入口。三平台真机验收未执行。

## 9. 合理假设与偏差

1. 沿用现有 jsd://node 和 jsd://canvas/selection 路径；新增查询字段 v/mode/roles/skill/platform/page/seq/id 作为 Copy 引用约定。
2. 多选使用重复 id 参数，保留顺序，不引入 JSON 数组或压缩/哈希 ID，避免不可逆和额外上下文。
3. platform/page 为必填，保证基本定位；seq 非定位必需，因此可空。
4. URL 是任务引用，不是 Copy 时数据导出。带参数链接由 parseNodeReference 校验，可由对应 resources/read 模板或后续 jsd_find 展开。
5. 节点有效性由后续读取确认；Copy 只校验 ID 形状，避免提前获取设计正文。
6. 最新需求取代此前 CopyEnvelope、pageContext、design legacy JSON 和角色化实时读取方案；相关实现和测试已删除，不保留备用入口。
