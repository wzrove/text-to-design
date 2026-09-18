# text-to-design MCP 已修复归档（已冻结）

> **本文件已冻结，只读。** 合并为 `.agents/skills/mcp-tdd` 之后，修复记录走
> `docs/mcp-errors/` 台账：`handle --fingerprint <fp> --fix … --file … --commit … --verified-by <回归runId>`。
> 本文件是 P1–P32 的历史归档（根因 / 代码落点 / 是否需重载插件），**不再新增条目**。
> 查历史根因、避免重复踩坑时读它；新的闭环写进台账。
> 维护口径：`../references/bookkeeping.md`。

> 已修复并经实测验证的条目。保留根因与修法，供回退排查时对照。
> 主体待修项见 `text-to-design-mcp-BUG记录.md`。
> 流程与排查方法见项目根目录 `AGENTS.md`。

---

## P1 旧 daemon 替换窗口过短 → 误报「端口被外来服务占用」

- **现象**：`runShim` 报 `端口 47820 被非 text-to-design MCP 服务占用`，
  但实际是本项目旧版 daemon 正在替换。
- **根因**：① 替换等待硬编码 `2000ms` 太短；② `probeUpstream` 把
  「daemon 在但未就绪」与「没有 daemon」混为一谈，都归 `none`；
  ③ `foreign` 判定与错误分支不匹配。
- **修**：
  - `config.ts` 新增 `DAEMON_REPLACE_MS = 6000`；`DAEMON_WAIT_MS` 5000 → 15000。
  - `daemon/probe.ts` 新增 `starting` 状态：旧 daemon 未退干净 / health 可达但
    `/mcp` 连不上 → `starting`（而非 `none`/`foreign`）。
  - `daemon/run.ts` 区分 `none`（拉起）与 `starting`（静候，不重复拉起）。
  - `daemon/proxy.ts` 重连循环适配 `starting`。

## P2 shim 对「仅 1 个工具」的 daemon 曾误判外来服务

- **现象**：会话在插件离线时建立，工具表只剩 `jsd_ping`（1 个）。
- **根因**：旧判定用 `tools.length < N`；目录门控设计已废弃，改为可用性下沉运行时。
- **状态**：现存代码正确（`tools.length === 0 || !tools.every(startsWith('jsd_'))`），
  留档避免回退。

## P3 二进制响应无校验收尾 → 孤儿帧污染后续请求

- **现象**：插件在二进制帧中途断开时 `binaryTarget` 悬空，后续不相关请求的
  binary 帧被塞进错误目标。
- **根因**：单槽位设计假设「同一时刻仅一个二进制响应」，协议未携带 id 校验。
- **修**：新 meta 帧到达时若旧 target 未收齐，显式丢弃并 `warn` 点名两个 id；
  孤儿帧日志级别 `log` → `warn`。
- **遗留**：根治需协议加 id 字段，属插件侧改动，暂以显式告警替代。

## P4 静默 catch 掩盖上游/传输错误

- **现象**：请求失败只有一句 `请求超时` / `plugin error`，看不到底层原因。
- **根因**：为「不影响主流程」吞错，代价是丢失可观测性。
- **修**：三处补上下文与原因，不改变主流程容错行为 ——
  `pending.ts`（JSON 解析补 `e.message`）、`bridge.ts`（推送失败原因）、
  `transport.ts`（WS server error 详情）。

## P6 `jsd_group_nodes` 编组报 NaN

- **现象**：`错误: node_op 失败: in set_x: Expected "x" to have type number but got NaN instead`
- **根因（4 处断点，必须同时生效）**：
  ① **`absolutePosition` 在 jsDesign 上「存在但字段为 undefined」**
  （读出 `{x:undefined, y:undefined}`）。原代码只判断对象是否存在、未校验有限性
  → `NaN` 经 `pos` 传进坐标赋值，触发引擎 `set_x` 断言。
  实测诊断：`pos=NaN,NaN` 而 `box=2776.31,811.32,100,100`（box 正常）。
  ② `Math.min(...map(a => a.box.x))` 未过滤非有限值 → NaN 传播。
  ③ `frame.resize(maxX-minX, maxY-minY)` 未夹最小值，同尺寸节点算出 0
  → 与 P9 同源的 `>= 0.01` 校验错误。
  ④ **参数透传断点**：`ui/src/code/plugin.ts` 的 group 分支只透传 `ids`/`name`，
  `layoutMode`/`itemSpacing`/`padding*`/对齐参数全被丢弃 → 无论传什么布局参数
  都走纯归组分支，报错一字不差。
- **修**：
  - `shared/src/core/nodes.ts`：`pos` 与 `fallbackPos()` 父链累加**每步校验
    `Number.isFinite`**；包围盒过滤非有限值且全无效时显式报错；
    `resize` 夹到 `0.01`；`absolutePosition` 写入包 try/catch 退化为相对坐标。
  - `ui/src/code/plugin.ts`：补全全部布局参数透传。
- **验证**：重载插件后实测编组成功。

## P8 `jsd_reparent_nodes` 迁入 auto-layout 容器报 `jsGet undefined`

- **现象**：`错误: node_op 失败: in get_layoutGrow: Cannot read properties of undefined (reading 'jsGet')`
- **根因**：`reparentNodes()` 用 `parent.insertChild(...)` 迁入。auto-layout 父容器上
  `insertChild` 会走引擎布局重算路径读取子节点 `layoutGrow`，而插件侧节点代理在
  jsDesign 上该读取崩溃。原注释「对 auto-layout 框架用 insertChild 比 appendChild
  更可靠」**与实测相反**。非 auto-layout 父容器不读该属性，故不受影响。
- **修**：`reparentNodes()` 检测父容器 `layoutMode !== 'NONE'` 时改用 `appendChild`；
  非 auto-layout 保持 `insertChild` 以保留 index 语义。
- **验证**：重载插件后实测迁入 auto-layout 容器成功，且布局自动生效。

## P5 `jsd_ping` 能力上报信息量不足

- **现象**：`capabilities` 只有 `["styles"]`，无法判断「导出 / 图片填充 / 批量」
  这类能力是否可用。
- **根因**：**不是上报漏了**。`hostCapabilitySchema` 里列的是**平台差异超集能力**
  （`textTruncation` / `componentProperties` / `variables` / `getMainComponentAsync`
  / `platformOps`），jsDesign 确实一项都不支持，只报 `styles` 是**准确**的。
  真正的问题是没有把「两平台都具备的核心能力」单列出来，调用方只能靠猜。
- **修**：
  - `shared/src/schemas/platform.ts`：新增 `coreCapabilitySchema` 与
    `CORE_CAPABILITIES` 常量（create / modify / structure / component / export / image）。
  - `ui/src/code/plugin.ts`：ping 分支一并回传 `coreCapabilities: CORE_CAPABILITIES`
    ——核心能力平台无关，直接取共享常量，不需要各 adapter 重复声明。
  - `shared/src/schemas/results.ts` 增字段；`mcp-server/src/tools/session.ts` 透传，
    并重写 `jsd_ping` 描述（两个能力表各自的含义）。
- **验证**：重载插件 + 重启 daemon 后实测返回
  `capabilities: ["styles"]` + `coreCapabilities: [create, modify, structure, component, export, image]`。

## P9 创建 LINE 时零维被 resize 校验拒绝

- **现象**：create 的 children 里放 `{type:"LINE", width:20, height:0}`，报
  `execute 失败: in resize: Expected "width" to have value >= 0.01`。
- **根因**：`buildNode()` 的创建路径无条件 `node.resize(spec.width, spec.height ?? node.height)`。
  LINE 的「线长 + 零厚」是合法形态（画布上已有的 `71:531` 序列化即 `width:30, height:0`），
  但引擎 resize 校验要求两维 `>= 0.01`，直接传 0 被拒——**存储侧允许 0、创建路径不允许**，
  两侧不一致。与 P6 第 ③ 处同源。
- **修**：`shared/src/core/buildNode.ts` 对 `type === 'LINE'` 的 resize 做零轴豁免
  （`Math.max(v, MIN_RESIZE_SIZE)`，`MIN_RESIZE_SIZE = 0.01`）；其余类型行为不变。
  `jsd_create_line` 描述同步说明。
- **验证**：重载插件后实测 `jsd_create_line({width:20, height:0})` 成功；
  序列化回读 `width:20, height:0`（引擎把零轴又归一成了 0，视觉与存储都正确）。

## P10 未显式传 `fills` 的纯描边图形被填灰底

- **现象**：只传 `strokes` 建描边图标，图形被自动加 `#CCCCCC` 灰底，
  图标看起来是一坨灰块。
- **根因**：`buildNode()` 只在**显式传了 `fills`** 时才写 `node.fills`，
  未传即落到引擎默认值；引擎对子图形的默认是灰底（与文档里
  「未显式传 fills 时默认白底」不符）。
- **修**：`shared/src/core/buildNode.ts`——未传 `fills` 但传了 `strokes`、
  且节点不是 FRAME 时，显式 `node.fills = []`。FRAME 容器仍走引擎默认白底
  （文档已声明，不动）。`fills` 字段描述同步说明该默认策略。
- **验证**：重载插件后实测只传 strokes 的矩形序列化**无 `fills` 字段**
  （灰底消失），导出 PNG 只剩描边。

## P11 `jsd_reparent_nodes` 调不动同父节点之间的层序

- **现象**：对已经是同一父节点子级的节点调 `reparent`（带 `index`），
  返回 `ok`、回显正常，但 `children` 顺序一字不变，画布渲染也不变。
- **根因**：`reparentNodes()` 里有一句
  `if (parent.id === n.parent?.id) continue;` —— **同父级直接短路返回**，
  index 被完全忽略。而工具描述「插入位置…置底用 0」读起来像可以用它调层序，
  于是表现为「改了层序却没生效」。
- **修**：`shared/src/core/nodes.ts` 拆出 `reorderChild()`：同父级且带 `index` 时
  真正调层序 —— 先直接 `insertChild`；若引擎不重排（实测为 no-op），兜底走
  「先移出到当前页 → 再按 index 插回」，往返后把 `x/y` 原样写回（同父级坐标不变）。
  另：auto-layout 容器不能用 index 调层序，改为**显式报错**而不是静默跳过。
  `index` 描述与 `jsd_reparent_nodes` 描述同步写明「index = children 下标 = 绘制顺序，
  0 是最底层」。
- **验证**：重载插件后实测三层容器 `[T_A, T_B, T_C]` → `reparent(T_A, index:2)`
  → `[T_B, T_C, T_A]`；再 `reparent(T_A, index:0)` → 复原 `[T_A, T_B, T_C]`，
  双向都生效且 x/y 无漂移。

## P12 平台语义 / 限制只写在本地文档里，模型看不到

- **现象**：`children` 顺序、层序调法、纯描边默认填充、LINE 零维、
  INSTANCE 子节点样式失效这些结论，此前只存在于 workspace 的文档中；
  **调用方（模型）读不到**，于是反复踩同一批坑（今天就在「粉圆压住 📦」上栽过一次）。
- **根因**：知识落点错了 —— 设计约定属于**工具契约**，应该跟工具描述/instructions 同源，
  而不是只写在给人看的 markdown 里。
- **修**（提示词 + 代码双侧落地）：
  - `mcp-server/src/server.ts` 的 `INSTRUCTIONS`：新增「画布语义速查」6 条 +
    「回显 ≠ 生效：关键视觉改动用 `jsd_export` 导小图目检」。
  - `mcp-server/src/tools/prompts.ts` 的「设计策略总纲」：新增第 7 条（层序与遮挡）、
    第 8 条（样式落点），并把收敛复核改成「靠导图目检，回显不等于生效」。
  - 工具描述：`jsd_find` / `jsd_get_selection` / `canvas-selection` 资源补「children =
    绘制顺序」；`props.ts` 抽 `INSTANCE_STYLE_WARN` 常量挂到
    set_fill_color / set_stroke / set_cornerRadius / set_text / set_effects 五个样式工具。
  - 代码：`shared/src/core/update.ts` 的实例子节点样式告警从「文字节点的
    fills/fontName」扩为「**任意节点 + 全部样式类字段**」（`INSTANCE_RISKY_PROPS`），
    几何/命名/显隐类字段不误报；节点多时折叠成计数，避免刷屏。
- **验证**：重启 daemon 后实测工具描述已是新文案（`jsd_find`、`jsd_set_stroke`）；
  重载插件后建临时实例，对子节点写 `cornerRadius` → 结果带 `warnings`（点名节点与字段），
  同节点写 `visible` → **无** warnings（无误报）。临时实例与测试节点已删。
- **维护要求**：这些约定**代码与文档要一起改**（见 `AGENTS.md` 第 4 节表后的同步提示）。

## P13 平台语义 / 限制「代码优先」落库（P12 的续集）

- **现象**：P12 把 6 条画布语义写进了提示词，但**提示词是软的**——模型仍可能忘、
  可能按直觉读；而且其中几条本就该由代码消除，不该让调用方记。
  （典型：`children` 方向记反了压错层，`jsd_resize_node` 给 LINE 传 0 直接抛引擎断言。）
- **根因**：知识落点仍偏提示词。正确顺序是**先问代码能不能兜，兜不住才写提示词**。
- **修（逐条，代码优先）**：
  - **层序自描述**：`SerializedNode` 增 `z` = 节点在父级 `children` 里的下标
    （= 绘制顺序，0 = 最底层）。`serialize.ts` 在递归 children 时顺带填（省一次父级扫描），
    顶层节点按 `parent.children` 现算（按 id 比对，插件侧 `children` 每次访问可能是新代理）；
    `getPageStructure` 也带 `z`；`serialized-node.ts` / `results.ts` 同步声明。
    → 判断遮挡**读 `z`**，不必记数组方向。提示词降级为「说明」。
  - **auto-layout 也能调层序**：新增 `insertChildAt(parent, index, node)`——
    父级是 auto-layout 时**临时 `layoutMode = 'NONE'`、`insertChild`、finally 恢复**，
    绕开 P8 那条会崩的布局重算路径；恢复后引擎按新 `children` 顺序重排，`index` 生效。
    `reorderChild()` / `reparentNodes()`（跨父级带 index 也不再静默丢弃）/ `groupNodes()`
    （组框插入 auto-layout 父级，原 `insertChild` 同样会崩）统一走它；
    只在**验证发现没落位**时报错，文案给出 `itemSpacing` / 对齐的替代做法。
  - **LINE 零维覆盖到改尺寸路径**：`MIN_RESIZE_SIZE` 从 `buildNode.ts` 提到
    `core/utils.ts` 共用；`update.ts` 的 resize 对 LINE 做零轴豁免（P9 同源），
    其他类型低于 0.01 时抛**可读错误**（原样冒泡的引擎断言看不懂）。
  - **超集字段不再静默跳过**：`update.ts` 检测被 `'in'` 守卫跳过的平台超集字段
    （`textTruncation` / `maxLines` / 四个 `*StyleId`；仅 TEXT 适用的两个做了类型豁免，
    免得把「类型不匹配」误报成「平台不支持」），进 `warnings` 点名。
  - **实例子节点样式：从「喊风险」到「给出口」**：`instanceStyleFixHint()` 按名字路径
    在主组件树里定位同源子节点，把它的 id 直接算出来放进 `warnings`
    （如 `主组件(71:230)里的「角标数」(71:221)`），调用方拿到就改主组件；
    找不到则回落为「改主组件 / `jsd_detach_instance`」。`INSTANCE_STYLE_WARN` 文案同步。
- **验证**：`pnpm -r run typecheck` 与 `pnpm build` 均通过；daemon 侧工具描述已生效
  （重启 daemon 即可）。**插件侧已重载实测通过**：`jsd_find` 全量节点带 `z`
  （如父级 `71:496` 下 23 个子节点 z=0..22 连续）；新建 HORIZONTAL 容器 A/B/C，
  `jsd_reparent_nodes` 把 C 调到 `index:0` → 顺序变 C/A/B，`layoutMode` 仍 HORIZONTAL。
- **维护要求**：`AGENTS.md` 第 4 节速查表改为「结论 + 代码落点」两列，
  新增语义先找代码落点，代码兜不住才写提示词（已固化为 `AGENTS.md` 第 5 节硬规则）。

## P14 调 auto-layout 层序把容器的 sizing 模式改了（P13 `insertChildAt` 的副作用）

- **现象**：P13 实测通过（层序确实调成了），但对比发现容器
  `primaryAxisSizingMode` 从 `AUTO` 变 `FIXED`、`counterAxisSizingMode` 从 `FIXED` 变 `AUTO`
  ——**只是调个层序，把容器尺寸模式改了**。
- **根因**：`insertChildAt()` 临时 `layoutMode = 'NONE'` 时，引擎会**连带重置**布局属性
  （sizing 对调、spacing/padding 归零）；原实现 `finally` 里只恢复 `layoutMode` 一项。
- **修**：`LAYOUT_PRESERVE_KEYS` 列出会被重置的属性（`primaryAxisSizingMode` /
  `counterAxisSizingMode` / 两个 `AlignItems` / `itemSpacing` / 四个 `padding*`），
  关布局前 `snapshotLayout()` 快照、**恢复 layoutMode 之后再** `restoreLayout()` 写回；
  单项写回失败只吞该项错误，不回滚整个插入（宁可少恢复一项，也别把操作整体弄没）。
- **验证**：重载插件后新建 `HORIZONTAL` + `primaryAxisSizingMode:AUTO` +
  `counterAxisSizingMode:FIXED` + `itemSpacing:10` + `paddingLeft:5` + `paddingTop:8` 的容器，
  C 调 `index:0` → 顺序 C/A/B 且**上述布局属性全部保持原值**（修复前 sizing 会对调）。
  测试节点已删。
- **教训**：「临时改平台状态再恢复」这类兜底，**恢复项必须和引擎的实际副作用对齐**——
  只恢复自己改的那一个属性是常见漏点，验证时要回读**相邻属性**而不只是目标属性。

## P20 `create_frame` 不收 `cornerRadius` + strict 报错把全部字段列成「非法」

- **现象**：给 `jsd_create_frame` 传 `cornerRadius` 被拒，报错
  `入参校验失败: 实际收到字段 [name, x, y, width, height, layoutMode, fills, cornerRadius]。…原始校验: data must NOT have additional properties`
  —— 把**全部**入参字段平铺出来，看着像每个字段都非法，实际只有 `cornerRadius` 越界。
- **根因**：① `frameNodeSchema` 只有 `visualFields`，没有圆角字段（RECTANGLE/ELLIPSE
  有，FRAME 漏了）；引擎本身支持 FRAME 圆角（`jsd_set_cornerRadius` 也写明 FRAME 生效）。
  ② `friendly-schema.ts` 的失败改写只回显「实际收到的字段」，没区分哪个越界。
- **修**：
  - `shared/src/schemas/execute-schemas.ts`：抽出 `cornerFields`
    （`cornerRadius` + 四角），FRAME 补上、RECTANGLE 改为复用。
  - `mcp-server/src/daemon/friendly-schema.ts`：新增 `unexpectedKeys()`，
    用 schema 的 `properties` 求差集，越界时**只点名那几个字段**并列出该工具
    接受的字段；联合 schema（`anyOf`/`oneOf`）与放行额外字段的 schema 检测不到，
    退回原报错，不误伤。
- **验证**：重启 daemon 后
  `jsd_create_frame{width:400,height:200,cornerRadius:32}` → 返回
  `cornerRadius:32` 且四角一致、尺寸 400×200 正确。测试节点已删。
- **备注**：编号说明 —— 代码注释里 `P14` 已被「临时关 auto-layout 会连带重置布局属性」
  占用，故本轮三条在代码里记作 **P17/P18/P19**（reparent 坐标 / 尺寸与 padding /
  cornerRadius 与报错），本文档对应 **P18/P19/P20**。

## P18 `reparent` 到深层容器时坐标不换算（节点飞出画布）

- **现象**：reparent 进嵌套容器后 x/y 保留**旧父坐标系的数值**，节点跑到画布外。
  同父级的一层容器**会**换算，嵌在 auto-layout 里的深层容器**不会**
  （实测：卡片(30,400) → 图标行 → 订单项 → 图标盒，三层，x/y 原样保留）。
- **根因**：`reparentNodes` 只调 `appendChild` / `insertChild`，把坐标换算完全交给引擎；
  而引擎在这条路径上的行为不稳定。`groupNodes` 早就知道这个坑并自己还原坐标，
  `reparentNodes` 却漏了 —— 同一个仓库里两套口径。
- **修**：`shared/src/core/nodes.ts` 抽出 `absoluteOrigin(node)`：
  ① 优先读原生 `absolutePosition`，**逐字段校验有限性**（jsDesign 存在但读出
  `{x:undefined,y:undefined}`，直接采信会让 NaN 流进引擎触发 `set_x` 断言）；
  ② 读不到就沿父链累加 x/y 兜底，每步校验。
  `reparentNodes` 移动前记快照、移动后 `n.x = origin.x - parentOrigin.x`（逐轴校验有限性）；
  **auto-layout 父级跳过**（排布由布局接管，写 x/y 无效且会被覆盖）。
  `groupNodes` 里那段重复的坐标兜底逻辑一并收敛到同一个助手。
- **验证**（重载插件后）：
  - 深层 NONE 容器：页面系 (4583,2120) 的椭圆 → 图标盒（页面系原点 4334,2132），
    返回 `x:249, y:-11`（修复前会是 4583,2120）。
  - auto-layout 父级：reparent 进 HORIZONTAL 容器返回 `x:0, y:0`，由布局接管，符合预期。
  - 测试节点已删。
- **教训**：「引擎会不会自动换算」这类**不稳定行为不要依赖**。放置类操作统一以页面系
  记账再落到相对坐标，是唯一稳的口径。

## P19 `create_frame` 带 children 时尺寸被 auto-layout 吃掉 + padding 默认 10

- **现象**：传 `width:690,height:210` 带嵌套 children 建卡片，返回 **630×160**；
  嵌套子项的 width/height 同样被忽略（订单项要 120×116，实际 72×72）。
  另外 `paddingTop/Right/Bottom/Left` 即便不传也全被置 **10**（而 `itemSpacing` 缺省 0）。
- **根因**：① `buildNode` 早期 `resize()` 之后才设 `layoutMode`，引擎开启 auto-layout 时
  按内容重算容器尺寸把 resize 覆盖；同时把 `primaryAxisSizingMode` 默认置 `AUTO`（hug）。
  ② padding 四边只在「调用方传了」时才写，引擎默认值 10 就漏出来了 —— 与同文件里
  `itemSpacing ?? 0` 的口径不一致。
- **修**：`shared/src/core/buildNode.ts`
  1. padding 四边与 itemSpacing 同口径，未显式传一律归 0；
  2. 显式给了尺寸却没声明该轴 sizingMode → 该轴钉 `FIXED`
     （HORIZONTAL 主轴=宽、VERTICAL 主轴=高），调用方显式声明过的不抢；
  3. 抽出 `applySize()`，在 layout 配置**之后**再压一次尺寸（LINE 零轴豁免逻辑一并收进去）。
- **验证**（重载插件后）：
  - 带 4 层嵌套 children 建卡片 → **690×210**，padding 24/30/20/30 与传入一致，
    嵌套层 630×44 / 630×116 / 120×116 全部生效（修复前 630×160 / 72×72）。
  - 只传 `layoutMode:HORIZONTAL` 不传 padding → 四边 **0**（修复前 10）。
  - 测试节点已删。
- **教训**：建节点的字段应用**顺序**是语义的一部分 —— 引擎会在开启 auto-layout 时重算
  尺寸，凡是「调用方显式给的」都要在最后再压一遍，否则就是静默失效。

### P19 补丁：`resize()` 会把显式声明的 AUTO 改回 FIXED

- **现象**（P19 主路径验收通过后，加测边界才炸出来）：调用方显式声明
  `primaryAxisSizingMode:"AUTO"` + `counterAxisSizingMode:"AUTO"` 并给
  `width:500,height:80`，返回两个轴都是 **FIXED**、尺寸 500×80 —— 说了要 hug 却给
  固定尺寸。而代码注释当时写着「显式声明过的一律尊重，不抢」，是**注释在撒谎**。
- **根因**：末尾补的那次 `resize()` 本身就会把 sizingMode 从 AUTO 翻成 FIXED；
  而 sizingMode 的赋值在 resize **之前**，于是被覆盖。
- **修**：`buildNode.ts` 在末尾 `applySize()` **之后**把调用方声明过的 sizingMode
  再写一次。最终顺序 =
  `设 sizingMode → 未声明的轴钉 FIXED → resize → 重写显式声明的 sizingMode`。
- **验证**（重载插件后）：
  - 显式 `AUTO/AUTO` + 子块 120×40 → 返回 `AUTO/AUTO`，尺寸 hug 到 **120×40**
    （补丁前 FIXED/FIXED、500×80）。
  - 混合 `primary=AUTO, counter=FIXED` → 宽度 hug 到 **120**、高度 **80**，
    两个模式各自保持。
  - 回归主路径（不声明 sizingMode 给 690×210）→ 仍为 `FIXED/FIXED`、690×210、
    嵌套层 630×44 / 630×116 生效，无回归。
  - 测试节点已删。
- **教训**：「显式给的值要在最后压一遍」这条**不能无条件套用** —— 压的动作本身可能有
  副作用（这里是 resize 翻 sizingMode）。正确姿势是压完再把调用方的显式意图写回，
  而不是压之前。另外：**主路径通过 ≠ 分支正确**，边界用例（显式声明值）必须单独测。

## P21 写类工具集体报「未知方法」= 插件跑旧产物（非参数问题）

- **现象**：一串**写类**工具全部失败，报错统一为「未知方法: X」：
  - `jsd_move_node` → `未知方法: move`
  - `jsd_resize_node` → `未知方法: resize`
  - `jsd_set_fill_color` → `未知方法: set_fill`
  而 `jsd_create_*` / `jsd_find` / `jsd_export` /
  `jsd_manage_nodes(op=select|remove|reparent)` / `jsd_reparent_nodes` **全部正常**。
- **根因**：插件进程加载的 `dist/jsdesign/code.js` 是**旧产物**，
  运行时未注册 `set_fill` / `move` / `resize` 这几个方法名。
  代码侧无需改动 —— 只要 **在即时设计里重新运行插件** 即恢复。
- **验证**（重载插件后实测）：`jsd_move_node` / `jsd_resize_node` /
  `jsd_set_fill_color` 三者全部成功返回 `updated`，写入值真实落盘。
- **教训（本条核心）**：**「未知方法: X」不是参数写错**。
  看到这个报错不要改参数、不要换工具，直接按 AGENTS.md §1：
  `pnpm build` → 即时设计「插件 → 开发 → 重新运行」→ 再实测。
  与「报错一字不差 = 插件跑旧产物」同源，只是表现从"报错相同"变成
  "方法根本不存在"。
- **失效期的降级手法**（`move` 不可用时曾实测可用）：
  先 `jsd_create_*` 在页面级建节点，再 `jsd_reparent_nodes` 移入目标父级。
  注意：**跨父级 reparent 会保持节点的绝对位置（内部换算）**，
  所以视觉位置不变、无需为「不被移动」而修 x/y；
  但要把节点摆到新父的**指定相对坐标**，仍必须显式一次 `move`。
  ⚠ 此处原写「x/y 按新父相对系重解释，仍需一次 move 修正」——口径已于 P25 更正。

---

## P22 `jsd_batch` 步骤回显把图标 `vectorPaths` 全量拼回 → 撑爆上下文

- **现象**：batch 内含一步 `jsd_create_icon` → 整批返回 **146,410 字符**；
  往 3 个组件里各补 4 个导航图标（clone → reparent → move → set_stroke，36 步）
  → **281,186 字符**。两次都触发「exceeds maximum allowed tokens」，
  结果被落盘到 `tool-results/*.txt`，模型看不到 `ok`/报错 —— 等于**盲执行**。
- **根因**：batch 原样拼接每步的完整 `structuredContent`；而图标类节点
  （`jsd_create_icon` / `jsd_clone_node`）的 `created` 带**完整 `vectorPaths.data`**
  （单条 >10KB、16 位小数）。
- **修**（代码落点）：
  - `packages/mcp-server/src/tools/batch.ts` + `packages/shared/src/schemas/batch.ts`：
    步骤回显做**摘要裁剪** —— 丢 `vectorPaths` 等渲染无关大字段，只留
    `id/name/type/x/y` 等定位必需项，结果带 `echoTrimmed` 标记；
  - 裁剪后仍超预算（20K）→ 再降一级为 **id 清单**，结果带 `echoOmitted`；
  - **占位符解析不受影响**（在服务端解析，不依赖回显）——所以「黑盒执行」不再是必然。
- **验证**：`smoke-split.ts` —— `batch 回显裁剪: 保留 id/坐标=true 丢 vectorPaths=true
  echoTrimmed=true`；`batch 超预算降级: echoOmitted=true 保留 id 清单=true 长度=11591`。
  ✅ **引擎侧实测通过**（2026-09-13，连接恢复后）：
  `jsd_batch([jsd_find{ids:[icon-sparkles],depth:1}])` → 结果
  `{"nodes":[{"id":"DcV_RzQX1K0Y0F62XWixZ","name":"icon-sparkles","type":"FRAME",
  "x":45,"y":471,"width":24,"height":24,"z":9,"parentId":"70:206"}],
  "total":1}` + `echoTrimmed:true`；原 4 子节点带 `vectorPaths` 在回显里**全部消失**。
- **是否需要重载插件**：**不需要**（纯 daemon 侧改动），重启 daemon 即生效。
- **教训**：回显也是「上下文预算」的一部分。凡是把引擎原始结构回传的地方，
  都要假设它可能带巨型字段（图标路径、base64、网格数据）。

## P23 `jsd_manage_nodes` 各 op 回显键不统一 → batch 占位符取不到 `reparent` 结果

- **现象**：batch 里 `reparent` 步骤执行成功（父级确实换了、节点位置也对），
  但下一步用 `{{rep.updated[0].id}}` 引用它时报
  `无法解析占位符引用「rep.updated[0].id」`，**整批中止**（`stopOnError` 默认 true），
  后续步骤（含导出）全没跑 —— 状态与回显不一致，排查时极易怀疑「reparent 没生效」。
- **根因**：`jsd_manage_nodes` 各 op 的返回键不同，`reparent` 回的是 **`moved`**；
  而 batch 工具描述里的「常用取值路径速查」只列了
  `created` / `nodes[0]` / `updated[0]` / `swapped[0]`。
- **修**（代码落点）：
  - `packages/mcp-server/src/tools/manage.ts` + `nodes.ts`、
    `packages/shared/src/schemas/split-ops.ts`：`reparent` **同时返回 `moved` 与 `updated`**
    （同一份数据挂两个键，向后兼容）；
  - batch 描述里**补全该工具各 op 的返回键速查**。
- **验证**：`smoke-split.ts` 正向用例含 `jsd_reparent_nodes` → `node_op{op:'reparent'}`，
  40/40 通过。⚠ 引擎侧真实调用待补。
- **是否需要重载插件**：**不需要**（回显键在 daemon 侧组装），重启 daemon 即生效。

## P24 `combine_as_variants` 必然失败，且报错没给可执行出口

- **现象**：三个刚建好的合规 COMPONENT（390×96、7 子节点、同构）传
  `jsd_combine_as_variants`，三种兜底姿势全败，报
  `component_op combine_as_variants 失败: in get_booleanOperation: Value is not a string`。
  报错只说明「失败了」，调用方于是**反复重试 / 回头怀疑组件结构**，浪费整轮工作。
- **根因**：引擎在合并路径里把节点当 `BOOLEAN_OPERATION` 取属性，拿到非字符串即抛。
  与组件本身结构无关（同尺寸同层级的合规组件同样必败）——**平台缺陷，MCP 层无法绕过**。
- **修**（代码落点 `packages/shared/src/core/component.ts`）：**缺陷本身不修**，
  改为在报错里**直接给可执行出口**：
  - 明说「本引擎版本的变体集做不出来（平台缺陷 P24），不要在结构上找原因，也别重试」；
  - 给出两条路：① 每个状态各做一个独立 COMPONENT，按 **「族名 / 状态」** 命名
    （如 `Nav / Face-to-Face`、`Nav / Inbox`、`Nav / Me`），调用方按名字取用；
    ② 确需变体语义则**手工在画布上合并**，或换到支持该能力的引擎（如 Figma）执行；
  - 提醒「一个主件 + 每屏改子节点颜色」这条捷径**同样不通**（实例子节点样式 override
    平台不保证渲染生效，见 **P7**）——多状态只能靠多主件；
  - 保留引擎原文供上报，并列出本次涉及的组件名与 id。
- **验证**：✅ **2026-09-13 引擎侧实测通过**（v3 修复后重载插件 + `component_op combine_as_variants`
  调 `78:364` / `78:365`）：返回完整富出口文案 ——「combine_as_variants 三种姿势均失败:
  本引擎版本的变体集做不出来（平台缺陷 P24）…」「引擎报错：克隆并入当前页: in
  get_booleanOperation: Value is not a string; 克隆移入当前页后合并: ...; 原节点直接合并:
  ...」「本次涉及的组件: __tmp_P30v3_set__(78:364)、__tmp_P30v3_B__(78:365)」「不要在
  结构上找原因,也别重试（合规组件同样必败）」+ 双出口 + ⚠ 关联 P7。
  **v3 迭代过程与「副作用探针才能兜异步抛」的关键洞察，详见本归档段尾 P30 子条**。
- **是否需要重载插件**：**需要**（`shared/src/core/component.ts` 属插件执行路径）→
  `pnpm build` 已重跑产物，用户已重载插件，引擎侧实测通过。

## P25 reparent 坐标口径更正（A）+ 批次几何漂移自动复核（B）

- **现象 A（原判断有误，此处更正）**：曾据「7 个子节点从绝对位置 `(-822,476)` 的源框架
  整体搬进 `(0,0)` 的组件主件后，坐标读回仍是 `(-822,476)`」判定
  「reparent 不做坐标换算，父级一动就得全部逐个回填」。
  **实为：reparent 跨父级移动会保持节点的绝对位置（内部换算）**——
  新父恰好在原点，所以「保持绝对位置」的结果看**起来**像「数值原样保留」。
  → 调用侧的正确预期：**reparent 不改变节点的视觉位置**；
  要把节点摆到新父的**指定相对坐标**，仍须显式 `move`。
  AGENTS.md 原写的「通常需手动修正 x/y」据此更正为「保持绝对位置，无需修正」。
- **现象 B（静默漂移）**：一轮含 `remove`(8 节点) + `reparent` + `move` 的批量之后，
  `78:2` 里两个**未被本次操作触及**的节点自行移位：
  `cta-button (24,720) → (28,618)`、`lang-card (24,430) → (28,458)`（x 双双 +4）。
  无任何报错、回显正常。直接后果是 `cta-halo` 与按钮脱钩，渲染出「悬在导航区的孤光」——
  **看着像样式问题，实为几何漂移**，排查时极易走错方向。
- **修**（代码落点）：
  - `packages/shared/src/core/nodes.ts` / `utils.ts`：reparent 跨父级**保持绝对位置**的口径统一；
  - `packages/mcp-server/src/tools/drift-watch.ts`（新增）：批次含**结构变更**
    （remove / reparent 等）时**自动复核同层几何漂移**，异常进结果 `warnings`；
    `checkDrift:false` 可关（关掉则**不做任何额外读数**）；
  - `packages/mcp-server/src/tools/batch.ts` + `packages/shared/src/schemas/batch.ts`
    暴露 `checkDrift`。
- **验证**：`smoke-split.ts` —— `batch checkDrift 开关: 接受=false 时不做额外读数(是)`
  （插件调用次数恰为 1）。
  ⚠ **「真出现漂移时能被检出」这一正向用例未能构造**——原漂移不可按需复现；
  需在引擎侧实际遇到时观察 `warnings` 是否点名。此项作为**唯一未闭环的验证点**保留。
- **是否需要重载插件**：**需要**（`nodes.ts` 属 shared / 插件执行路径）→ 已重载；
  引擎侧待补。
- **教训**：回显正常 ≠ 状态正确。批量里含结构变更时，**收尾要复核同层其它节点**，
  不要只看本次操作的目标节点。

## P26 `recursive:true` 连目标节点**自身**一起改 → 图标容器被印上方框描边

- **现象**：用 `jsd_set_stroke(ids:[图标FRAME], recursive:true, strokes:[…])` 改图标颜色，
  字形确实改了，**但每个 24×24 图标外框也被加上 `strokeWeight:1` 的描边** ——
  渲染出「每个图标套一个方框」。3 组件 × 4 图标 = **12 个图标全员中招**。
- **根因**：`recursive` 的「子树」原实现**包含目标节点自身**；而 FRAME 一旦有描边
  就会渲染成矩形框。工具描述只警告「目标为大容器时慎用（会连坐修改全部后代）」，
  **没有点明「自己也算」** —— 照字面理解会以为「后代」不含自身。
- **修**（代码落点 `packages/shared/src/core/update.ts` / `utils.ts`、
  `packages/mcp-server/src/tools/update-common.ts` / `props.ts`）：
  - `recursive:true` **默认不再改目标节点自身**，只作用于后代；
  - 确需连自身改 → 显式 **`includeSelf:true`**（新增的**定位字段**，不进 `props`，
    否则会被引擎方法白名单拒「方法 set_stroke 不接受字段: includeSelf」）；
  - `includeSelf:true` 命中**肉眼可见样式字段**（`CONTAINER_SELF_VISIBLE_PROPS`：
    `fills` / `strokes` / `strokeWeight*` / `strokeAlign` / `strokeCap` / `strokeJoin` /
    `dashPattern` / `effects` / `cornerRadius*` / `clipsContent` / `layoutGrids` / `arcData`）
    且目标是容器（`children > 0`）时，结果回 **`warnings` 点名节点与字段**；
    布局 / 可见性 / 命名类改自身**不刷屏**。
- **验证**：`smoke-split.ts` 正向用例含 `jsd_set_stroke{recursive:true}` 与
  `{recursive:true, includeSelf:true}` 两条 → 参数原样下发且 `includeSelf`
  **未漏进 `props`**，40/40 通过。✅ **引擎侧实测通过**（2026-09-13）：
  临时建 `__tmp_P26__`(78:331) + 子 `child-rect`(78:332)；
  `jsd_set_stroke{ids:[78:331], recursive:true, strokes:[红], strokeWeight:1}`
  → 子节点改红、容器自身**未**多 `strokes`；
  再 `jsd_set_stroke{…, recursive:true, includeSelf:true, strokes:[黑], strokeWeight:2}`
  → 容器 + 子都被改黑，且结果 `warnings` **点名** `__tmp_P26__(78:331)` + 命中字段
  `strokes, strokeWeight`，文案完整。
- **是否需要重载插件**：**需要**（`update.ts` 属 shared / 插件执行路径）→ 已重载；
  引擎侧待补。
- ⚠ **本修复的回显层带出新问题**（`update-common.ts:108-116` 的 `missing` 判定
  + `requestedProps` 仅过滤类型门控字段，导致 P28 / P29 两条误报），
  已迁到主体待修区（见 BUG记录 §P28 / §P29）。
- **教训**：`recursive` 这类「下沉到子树」的开关，**边界是闭区间还是开区间必须写死在描述里**。
  更稳的调用写法是：**只对真正的叶子节点（`VECTOR` / `RECTANGLE` / `ELLIPSE`）下 recursive**，
  不给容器本身传。


## P27 冒烟 `followUp jsd_find` 误报 `isError` —— 实为 stub 形状问题

- **现象**：`smoke-split.ts` 的 followUp 用例 **3/4 通过**，唯一 `jsd_find` 那例
  `isError=true`，但 `followUp` 本身是正确的
  （`{"type":"tool","tool":"jsd_select_nodes"}`）——即结果被标成错误、却仍带引导。
- **疑点（连接恢复前）**：假 bridge 对 `find` 只回 `{nodes:[NODE]}`，`NODE` 只有
  `{id,name,type,x,y}`；疑是 stub 形状不满足 `jsd_find` 的输出校验，也可能是
  `jsd_find` 在「结果被裁剪 / 超预算」路径上误置 `isError`。
- **验证**：✅ **真实 `jsd_find` 调用不报 `isError`**（2026-09-13，连接恢复后）：
  - `jsd_find{type:"FRAME", depth:0}` → 70KB 结果，正常 `ok:true`；
  - `jsd_find{type:"VECTOR", recursive:true, depth:0}` → 493K 字符落盘，但
    `isError:false`（落盘 ≠ 错误，只是超 token 上限），模型侧照样拿到 ok 标记；
  - `jsd_find{ids:["DcV_RzQX1K0Y0F62XWixZ"], depth:1}` → 直调 + batch 步内均
    `ok:true`。
- **结论**：冒烟里 `isError` 是 fake bridge 的 stub 形状缺陷（缺字段过不了
  `jsd_find` 的输出 schema），**非产品代码回归**。冒烟 stub 需补齐 `name/parent/
  z/fills/...` 等最小字段即可，不动 `jsd_find`。
- **是否需要重载插件**：**不需要**。


## P28 / P29 `recursive` 跳过自身时回显自相矛盾

### P28 — `recursive:true` 跳过目标自身时，目标 id 被误报「未更新/失效」

- **现象**：`jsd_set_stroke({ids:[FRAME], recursive:true, strokes:…})` 实际正确地只改了
  子节点、容器自身未被改，但回显仍带「以下节点未更新(可能已失效/被连坐删除):
  <FRAME_ID>」+「未传入任何属性,本次未修改」。两行互相矛盾、且会诱导调用方以为
  节点已失效，无谓触发重建 / 重试。
- **根因**：`mcp-server/src/tools/update-common.ts:108-116` 的 `missing` 判定 =
  `requestedIds.filter(id => !updated.has(id))`。P26 新增的语义「`recursive`
  默认不含目标自身」正好让目标节点合法地不出现在 `updated` 里，被同一行判定吞成
  「失效」。两处都对了，但**组合出来的回显是错的**。
- **修**：`packages/mcp-server/src/tools/update-common.ts`。`propUpdateTool`
  新增 `expectedUpdatedIds(args)` 帮手 —— `recursive===true && includeSelf!==true`
  时返回 `[]`（按 P26 语义，目标 id 本就不该出现在 updated，不算 missing），
  否则原样返回 `args.ids`。`extraContent` 改传这份过滤后的清单给 `updateFeedback`。
  后代 id 不在 `args.ids` 中，自然不受影响（真实缺失仍会进 missing 分支）。
- **验证**：✅ 引擎侧实测通过（2026-09-13，新 daemon 起来后）：
  - `jsd_set_stroke{ids:[78:340], recursive:true, strokes:[绿], strokeWeight:1}`
    → 「已更新 1 个节点」、updated=[child-r 78:341]；无「节点未更新(可能已失效)」、
    无「未传入任何属性」。
  - 同上再传 `includeSelf:true` → 「已更新 2 个节点」+ `warnings` 点名
    `__tmp_P28P29__(78:340)` + 命中字段；同样无两条矛盾告警。
  - 单节点非 recursive：`{ids:[78:340], strokes:[白], strokeWeight:1}` → 「已更新 1 个节点」，
    无矛盾告警（回归基线）。
- **是否需要重载插件**：**不需要**（daemon 侧反馈层），`pnpm build` + 重启 daemon
  即可（已实操：发 `/shutdown` → 新 daemon 自动拉起）。

### P29 — 「未传入任何属性，本次未修改」在 `set_stroke` 等非类型门控字段工具下恒误报

- **现象**：所有属性类工具都打印「已更新 N 个节点」紧接着「未传入任何属性，本次未
  修改」，与上一行直接打架。
- **根因**：`update-common.ts:89` 的 `if (updated.length > 0 && requested.length === 0)`
  条件写反 —— 实际触发于「调用方传了非类型门控字段（strokes / fills / effects 等）
  且至少 1 个节点被改」的常见路径。`requested` 由 `requestedProps(args)`
  （同文件 153）算出，**只**过滤登记在 `PROP_APPLICABILITY` 里的字段；而该表只
  收录**类型门控**字段（text/corner/layout）。`strokes` / `strokeWeight` / `effects`
  / `fills` 等跨类型普遍存在的字段**均不在表内** → `requested` 永远为 `[]` →
  永远误报。
- **修**：`update-common.ts:89`。条件改成 `updated.length === 0 && requested.length === 0`：
  真正「调用方什么都没传 + 引擎也没改任何节点」的边缘情况才报；正常成功路径下不
  再打架。
- **验证**：与 P28 同批实测，三种场景（recursive / includeSelf / 单节点）回显
  均不再带「未传入任何属性」。
- **是否需要重载插件**：**不需要**（同上）。

---

## P30 `combine_as_variants` 富出口文案在 jsDesign 上被引擎 getter 异步抛截胡

与 P24 同根：jsDesign 上姿势 1 实际**不会**抛错返回 `null`，而是返回一个**内部状态
损坏**的 `set`（引擎 getter 异步抛 `get_booleanOperation` / `get_name: Value is not a string`
等）。该异常不在 try 内、`set` 也非 null，wrapper 错过，整段富出口文案到不了调用方。

### 三姿势 try 边界 ＝ `serializeNode(s)` 探活（v3 关键洞察）

| 版本 | try 内含的代码 | 不在 try 但实际抛的代码 | 失败原因 |
|---|---|---|---|
| v1 | `combineAsVariants` + 选配 `name` 赋值 | `serializeNode(set)`（外层 return） | 异常在所有姿势 try 之外抛 — wrapper 兜不住 |
| v2 | v1 + `void s.id` 探针 | 同上 | `void s.id` 是纯 getter 探针，**vite/esbuild 当无副作用删除**，DCE 掉 → 与 v1 等价 |
| **v3（最终）** | v1 + **`serializeNode(s)` 探活** | （无） | 探针有真实副作用（构造序列化对象 + 触发引擎 getter），不会被 DCE；任一姿势内任意 getter 抛都归本姿势，全挂才统一抛富出口 |

### 代码落点（`packages/shared/src/core/component.ts`，2026-09-13 v3 落地）

每个姿势 try 内顺序：

```ts
const s = host.combineAsVariants(clones, page);
if (params.name != null && s != null) s.name = params.name;
if (s != null) serializeNode(s);   // ← 金丝雀:任何引擎 getter 抛都归本姿势
set = s ?? undefined;
```

### 引擎侧实测（2026-09-13 v3 + 用户已重载插件）

`create_frame` 建临时组件 A/B → `create_component` 固化为 `78:364` / `78:365` →
`combine_as_variants ids=[78:364,78:365]` 返回完整富出口文案：

```
错误: component_op combine_as_variants 失败: combine_as_variants 三种姿势均失败:
本引擎版本的变体集做不出来(平台缺陷 P24,建议附下面的报错上报)。
引擎报错:克隆并入当前页: in get_booleanOperation: Value is not a string;
克隆移入当前页后合并: in get_booleanOperation: Value is not a string;
原节点直接合并: in get_booleanOperation: Value is not a string。
本次涉及的组件:__tmp_P30v3_set__(78:364)、__tmp_P30v3_B__(78:365)。
不要在结构上找原因,也别重试(合规组件同样必败)。
可执行出口:①每个状态各做一个独立 COMPONENT,按「族名 / 状态」命名(如 Nav / Face-to-Face、
Nav / Inbox、Nav / Me),调用方按名字取用;②确需变体语义时在画布上手工合并,
或换到支持该能力的引擎(如 Figma)执行。
⚠ 「一个主件 + 每屏改子节点颜色」这条捷径同样不通:实例子节点的样式 override 平台
不保证渲染生效(见平台缺陷 P7),多状态只能靠多主件。
```

临时节点 `78:362` / `78:363` / `78:364` / `78:365` 已清理（剩 `78:364` 一项被
引擎卷入、不存在）。
- **是否需要重载插件**：**需要**（`shared/src/core/component.ts` 属插件执行路径）→
  `pnpm build` 已重跑产物（dist mtime 2026-09-14 00:12），用户已重载插件。

### 经验教训

1. **异步抛不可信 try 边界**：引擎在这种「假装成功并延迟崩」的语义下，try 边界必须
   包住**所有**会触发引擎 getter 的代码 — 包括序列化、空值判读、属性赋值。`void`/纯
   getter 探针 = 死代码（被 DCE）。
2. **副作用探针才是金丝雀**：`serializeNode(s)` 这种「真的做了点事」的副作用调用才是
   有效的引擎存活探针。
3. **错误归因要按姿势**：把每个姿势的失败归并到独立 `errors[]` 元素，让调用方一眼
   看出「每个姿势各自的失败原因」，比只回一个「失败了」价值高出 10×。


## P31 显式写的 `layoutMode` 被引擎回写 → 容器方向反转、子节点全叠在同一点

- **现象**：`jsd_create_frame({layoutMode:'HORIZONTAL', …})` 建导航栏并 `reparent` 两个
  36×36 按钮进去后，回读该容器 `layoutMode` 是 **`VERTICAL`**，两个按钮的坐标都是
  `(16,8)` —— 渲染上只看得见一个（分享按钮被压在返回按钮底下）。
  **回显全程正常**，导出图看起来像「右上角那个按钮没画出来 / 被裁掉了」，
  排查时极易走成样式或 z-order 问题。
- **复现**（5 组，全部**未复现**）：
  1. `create_frame` 仅传 `layoutMode`；2. 同参数 + 全部 padding/对齐（与原批次逐字段一致）；
  3. 同参数 + 对齐；4. 建好后 reparent **单个**子节点；5. 建好后一次 reparent **两个**子节点
  —— 以上回读均为 `HORIZONTAL`、子节点坐标 `0`/`36`（横向排布）；
  另按原批次做了 **8 步忠实复刻**（含两次 `jsd_create_icon` + 两次 reparent + 建导航栏），
  以及补测原批次唯一未覆盖的 `reparent` 进**非** auto-layout 父级 + `move`，同样正常。
- **根因**：**未定论**（故本条不以「已定位根因」归档）。代码侧能确证的只是
  「没有任何一处写 `layoutMode` 之后再回读校验」，与 P14（层序操作改 sizing 模式）、
  P19 补丁（`resize` 把显式 AUTO 改回 FIXED）属**同一族**：写完布局属性不能假定它还在。
  真实触发条件不可按需复现。
- **修**（代码落点）：
  - `packages/shared/src/core/utils.ts`：新增 `ensureLayoutMode(node, expected)`
    —— 「写 → 回读 → 不一致再压一次」，返回最终是否一致；
  - `buildNode.ts`：创建路径在**最后一次** `applySize`（会触发引擎重算）+ sizing 再压之后，
    回读校验方向；
  - `update.ts`：`set_layout` 在 `applyProps` 之后回读；**压不住则进 `warnings` 点名**
    （这里有 warnings 通道，按「绝不留回显成功实则没生效」办，并给出复核/重设出口）；
  - `nodes.ts`：`insertChildAt` 的 `NONE ↔ 方向` 临时往返**恢复之后**回读校验。
- **验证**：
  - 定点测试（mock host 模拟「auto-layout 容器 resize 后引擎把方向回写成 VERTICAL」）：
    4 项全通过，且**做了敏感性对照** —— 注释掉 `buildNode` 里的守卫后同一测试立刻变红
    （`layoutMode=VERTICAL`），守卫在时 `HORIZONTAL`、尺寸 `375×52` 未丢。
  - `verify.sh typecheck` 通过、`lint`（仅改动文件）通过；
    `verify.sh baseline` 判定改动前后 ✗ 集合一致（那条 `followUp jsd_find` 属既有失败 P27）。
  - ⚠ **「真实引擎上按需复现」这一正向用例未能构造**（同 P25），
    引擎侧只能在实际再遇到时观察是否自愈 / 是否点名 —— 作为本条的**未闭环验证点**保留。
- **是否需要重载插件**：**需要**（`shared/src/core/*` 属插件执行路径）→
  `pnpm build` 已重跑产物（`dist/jsdesign/code.js` 199.33 kB，mtime 2026-09-14 12:58）；
  **引擎侧已实测**（用户重载后）：原场景链路（导航栏同参容器 + 插入两个子按钮）回读
  `HORIZONTAL`、子节点在 `16`/`323`；补测了原批次漏掉的那条链路（先往 auto-layout 容器
  带 index 插 spacer 触发 `NONE ↔ 方向` 往返、紧接着再建导航栏）同样正常。
  **方向被回写的现象始终未能复现**，故守卫在该场景是「未命中就不动」的空转；
  真实触发条件下的自愈效果仍未验证（见下条未闭环验证点）。
- **教训**：
  1. **布局属性的写后回读要覆盖「方向」**：此前只对 sizing 模式做过再压一次（P19 补丁），
     方向漏了 —— 方向错了比尺寸错了更难看出来（不像尺寸，方向错只表现为「子节点叠一起」）。
  2. **「子节点全叠在同一点」先查容器方向**，别先怀疑 z-order / 样式 / 遮挡。
  3. 复现不出来时**不要编根因**：按「写后校验」把这一类都兜住，并把未闭环的验证点明确写出来。

## P32 带 `index` 往 auto-layout 容器插子节点 → 容器的显式尺寸被吃掉

- **现象**（引擎侧实测，非构造）：`335×400` 的 `VERTICAL` auto-layout 容器，
  `jsd_reparent_nodes({parentId, index:0})` 插入一个 **1px** 高的子节点后，
  **容器高度塌成 `1`**（= 内容高）。
- **对照实验**（定位到触发条件）：同一形状的容器改走 `appendChild` 路径
  （`reparent` **不传 `index`**）→ 高度完好 `400`。
  ⇒ 问题不在「插入」本身，而在 `insertChildAt` 为保 `index` 语义做的
  **`layoutMode: NONE ↔ 方向` 临时往返**。
- **根因**：该往返让引擎**重进** auto-layout，这期间写回去的布局属性**只是「回显是新值」**。
  证据链：插入后立刻回读该容器 `primaryAxisSizingMode` = `FIXED`（正是 `restoreLayout`
  写回的那个值），随后**只调了一次 `jsd_set_layout`（只传 layoutMode/itemSpacing/padding，
  没碰 sizing）**，再回读就变成 `AUTO` —— 引擎在重算时把主轴 sizing 翻回了 AUTO，
  容器于是按内容撑开。与 P14「只恢复 `layoutMode` 是不够的」是同一条的**不完整修复**：
  当时补了 sizing 快照，但**写回去的动作在那个窗口里不可靠，且没人回读校验**。
- **修**（代码落点 `packages/shared/src/core/nodes.ts`）：
  - `restoreLayoutVerified()`：快照写回后**再回读一遍**，不一致的重压一次；
  - `pinnedSizeOf()`：快照时**只有该轴 sizingMode 为 `FIXED`** 才记录尺寸（AUTO 是调用方
    要的 hug，不抢）；主轴随方向映射（`VERTICAL` 主轴=高，`HORIZONTAL` 主轴=宽）；
  - `applyPinnedSize()`：用 `resize` 把被吃掉的尺寸压回；
  - `insertChildAt()` 恢复顺序固定为「**方向 → 其余布局属性 → 尺寸**」（写方向会把 sizing
    翻成 AUTO，尺寸必须最后写），并在方向发生回写漂移时整套再补一遍。
- **验证**：
  - 定点测试 `jsd-insertchild-size-guard.ts`（mock 复刻「重进 auto-layout 即塌陷」）：
    5 项全通过。**敏感性对照**：注释掉 `applyPinnedSize` 一行，同一测试立刻变红
    （`height=1`，与引擎侧实测数值一致）。
  - `verify.sh typecheck` / `lint`（仅改动文件）通过；`smoke-split` 仅剩既有失败 P27
    （`verify.sh baseline` 已判定改动前后 ✗ 集合一致）。
  - 设计侧回归：`39:84` 导出与改动前**逐像素完全一致**（`ImageChops.difference` bbox 为
    `None`），确认本次改动 + 测试节点的增删没有污染画布。
- **是否需要重载插件**：**需要**（`nodes.ts` 属插件执行路径）→ `pnpm build` 已重跑产物；
  **引擎侧已实测闭环**（用户重载后）：
  1. 建 `335×400` 的 `VERTICAL` auto-layout 容器 → 带 `index:0` 插入一个 1px 子节点
     → 回读 **`height: 400`、`primaryAxisSizingMode: FIXED`、`layoutMode: VERTICAL`**
     （修复前同一条链路是 `height: 1`）；
  2. **再插一个**子节点（`index:1`）后立刻用**不写 `layoutMode`** 的探针
     （`jsd_set_layout({itemSpacing:0})`）复验 → 仍是 `400`/`FIXED`，
     证明这是**真状态**而不是「回显好看」；
  3. 反例：拿**会写 `layoutMode`** 的探针去打同一容器，容器又塌回 `1`/`AUTO`
     —— 这正是平台限制表里那条「写 `layoutMode` 会翻掉容器自身 sizing」，
     与本条修复无关，两者已分开记录。
  4. 画布回归：`39:84` 导出与改动前逐像素比对，最大单通道差 **3/255**、>10 的像素 **0 个**，
     且购票栏节点逐字段比对未变 → 判定为两次导出的抗锯齿抖动，非内容变更。
- **教训**：
  1. **「引擎里没生效、但回显是新值」是这一族缺陷的共同长相**：只恢复不校验 = 没恢复。
     凡是「自己改回来」的动作，都要回读。
  2. **写布局属性的顺序有意义**：方向会连带重置 sizing，所以 `方向 → 属性 → 尺寸`，
     尺寸必须收尾；反过来写会被前一步带走。
  3. **做对照实验能一步定位触发条件**：`index` 路径 vs `appendChild` 路径只差一次
     `insertChild` 调用形态，却把范围从「reparent 全坏」缩到「带 index 的往返」。
