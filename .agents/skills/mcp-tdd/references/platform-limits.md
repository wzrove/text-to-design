# 已知平台限制 / 语义陷阱

> 何时读：怀疑某现象属平台限制（引擎静默忽略、字段存在但不生效），
> 或已判定一条，要决定「代码兜 / 提示词 / 记账」。

处理口径（三档：**代码兜住 → 提示词 → 归档**，口诀「能代码化的别写提示词，能自动化的别让人记」）
见 `SKILL.md` 的「平台限制：三档处理」，本文件只维护**已知清单**。

## 清单

| 现象 | 根因 | 处理口径 | 代码落点 |
|---|---|---|---|
| `jsd_clone_node` 克隆 INSTANCE：回显的 `parentId` 与 `jsd_find` 都指向**源节点的父级**，副本**实际挂在页面根**；对副本 `jsd_reparent_nodes` 回显 `moved` 却不换父级 → 按父级相对坐标摆放全落到画布空白处 | 引擎 `node.clone()` 产出的副本父指针不更新（`page.appendChild` 只挂树不改指针）；reparent 见「父级已是目标」而静默跳过 | **不依赖克隆做布局**：用现有节点重排（本例改用 82 座填满栅格）。必须克隆时：克隆后先用 `jsd_find 2:1` 看**页面 children 列表**（那才是真相，节点自报的 parentId 不可信），把目标父级当作页面，摆位用页面绝对坐标 | 待定：可在 `cloneNodes` 里落树后复核「页面 children 是否含该 id」，不一致就 `warnings` 点名或直接报错（台账未决 `d432b3e41058`） |
| `jsd_swap_component`（核心 `swapComponents`）报 `in swapComponent: Cannot read properties of undefined (reading 'type')` | 引擎的 `instance.swapComponent(component)` 内部读到 undefined——待查（组件与实例同页、id 有效，仍失败） | **暂不用它换状态**：改用既有实例摆位（本例：VIP 区留一个「已售」座，省掉 swap/create 需求）；确需换绑时先构造最小用例复现 | 台账未决 `0332b01901ad`（pending 排查） |
| 对实例子节点改 `fills` / `fontName` 等样式，回显是新值但渲染不变 | 引擎不支持实例子节点样式 override 持久化（`characters` 文字内容正常） | **平台限制，不修**。改为「检测 + 点名 + 给出口」：写样式类字段到 INSTANCE 内子节点时返回 `warnings` 并算出主组件对应子节点 id；样式类工具描述统一挂 `INSTANCE_STYLE_WARN` | `shared/src/core/update.ts`（`instanceStyleFixHint()`） |
| 创建 `LINE` 传 `height: 0` 被 `resize` 拒绝（`>= 0.01`） | 存储侧允许零轴、创建路径校验不允许 | 创建路径对 `type === 'LINE'` 做零轴豁免，其余类型行为不变 | `shared/src/core/buildNode.ts` |
| 只传 `strokes` 的描边图形被自动加灰底 | 未显式传 `fills` 时落到引擎默认值（子图形默认灰底，与文档不符） | 未传 `fills` 但传了 `strokes` 且非 FRAME → 显式 `node.fills = []`；FRAME 仍走默认白底 | `shared/src/core/buildNode.ts` |
| 迁入 auto-layout 容器报 `in get_layoutGrow: ... 'jsGet'` | auto-layout 父容器上 `insertChild` 会触发引擎布局重算，读子节点 `layoutGrow` 崩溃。原注释「insertChild 比 appendChild 更可靠」**与实测相反** | 父容器 `layoutMode !== 'NONE'` 时改用 `appendChild`；非 auto-layout 保持 `insertChild` 以保留 index 语义 | `shared/src/core/nodes.ts` |
| `jsd_ping` 的 `capabilities` 只有 `["styles"]`，看着像漏报 | 该表列的是**平台差异超集能力**，jsDesign 确实一项都不支持，只报 `styles` 是准确的 | 新增 `coreCapabilities`（create / modify / structure / component / export / image）表达平台无关核心能力，无需各 adapter 重复声明 | `shared/src/schemas/platform.ts`、`ui/src/code/plugin.ts` |
| 实例侧序列化读到空 `fills` | 实例 override 可能未落盘 | **不要据此判定样式缺陷**，先查主组件 | —— |
| 调 `jsd_set_layout` 改容器 `layoutMode`（如 `VERTICAL`→`HORIZONTAL`）后，容器**自身**的 `primaryAxisSizingMode` 被改成 `AUTO`，显式尺寸随之缩到内容高 | 引擎在切换布局方向时重算容器自身 sizing（P14 `insertChildAt` 副作用的同类） | **平台限制，调用方需重设**：改 `layoutMode` 的同批里显式回填 `primaryAxisSizingMode` + 目标尺寸，不要指望原值保留 | —— |
| 父容器 `primaryAxisSizingMode=AUTO` **不会**随子节点的 auto-resize 后高度变化而重算 → 子文本被父卡裁切（实例：子 TEXT 改 `textAutoResize=HEIGHT` 后高 42→105，父卡仍停在 104） | 引擎不向上传播内容尺寸变化，AUTO 撑高是「一次性」的 | **平台限制，调用方需重设**：改动子节点高度后显式 `resize` 父容器到目标高（或把父卡改 `FIXED` 给死高度），别信 AUTO 会自己跟上 | —— |
| 显式传 `layoutMode`（如 `HORIZONTAL`），回读却是另一方向（`VERTICAL`）→ 子节点全叠在同一点（实例：返回/分享两个按钮叠在 `(16,8)`，渲染上只看得见一个）；**真实触发条件未能复现**（见 P31：单子 / 双子 reparent、原批次 8 步忠实复刻、3 组创建参数对照，全部正常） | 未定论。同族证据指向「引擎在布局重算后会回写容器布局属性」——P14（层序操作改 sizing 模式）、P19 补丁（resize 把 AUTO 改回 FIXED）都是同一族：写完布局属性不能假定它还在 | **代码已兜住**：三处写 `layoutMode` 的落点统一改走「写 → 回读 → 不一致再压一次」；`set_layout` 压不住时进 `warnings` 点名。命中现象时先读 `layoutMode` 再依赖方向做后续操作 | `shared/src/core/utils.ts`（`ensureLayoutMode`）、`buildNode.ts`（创建路径 `applySize` 之后）、`update.ts`（`set_layout` 回读 + `warnings`）、`nodes.ts`（`insertChildAt` 恢复之后） |
| 往 auto-layout 容器**带 `index`** 插子节点后，容器的**显式尺寸被吃掉**（实测 `height: 400` 的 VERTICAL 容器插入一个 1px 子节点后变 `height: 1`；**对照组**同一容器改走 `appendChild` 不触发此事，尺寸完好） | `insertChildAt` 的 `NONE ↔ 方向` 往返让引擎**重进** auto-layout；这期间写回的 `primaryAxisSizingMode` 只是「回显是新值」——回读先显示 `FIXED`，再做一次布局操作就变回 `AUTO`，容器当场按内容撑开（P32） | **代码已兜住**：恢复顺序固定为「方向 → 其余布局属性 → 尺寸」，且每一步都回读校验；快照里该轴为 `FIXED` 的，收尾用 `resize` 把尺寸压回去 | `shared/src/core/nodes.ts`（`restoreLayoutVerified` / `pinnedSizeOf` / `applyPinnedSize`） |
| 文本里的 `▾`(U+25BE) / `▸`(U+25B8) 等几何箭头渲染成方块（豆腐块） | `SourceHanSansCN` 无该字形，引擎不做字体回退 | **平台限制，调用方换实现**：装饰性箭头改用 `jsd_create_icon`（`chevron-down` / `chevron-right`）独立图标节点，不要塞进文本 `characters` | —— |

## 用法

先把现象在本表对一遍——**命中就照「处理口径」走，别重新发明**；没命中再按三档判断。
判定后**必须补一行进本表**，否则下次还要重新查一遍。

只有限制**必须由调用方决策**（例如「需要实例级差异时请重建为静态节点」）时才写进工具描述，
且保证**工具描述 + `prompts.ts` 总纲 + `server.ts` 的 `INSTRUCTIONS` 三处一致**。
