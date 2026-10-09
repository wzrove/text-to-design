# 0035. 图表支持：服务端单向编译加复用 SVG 导入通道，骨架原生绘图区 SVG，不引入模式

- **日期：** 2026-10-09
- **状态：** 已被取代
- **影响范围：** `packages/shared/`（新增 `dicts/chart.ts`、`schemas/chart.ts`、`schemas/execute.ts` 新增 `createSvgInputSchema`、两个 index 出口、i18n 三键）、`packages/mcp-server/`（新增 `src/charts.ts` 编译器、`src/tools/chart.ts` 工具、`src/tools/prompts.ts` 新增 `chart-by-code` 配方、`src/tools/create.ts` 的 `jsd_create_svg` 改 `run` 并支持文件来源、`src/config.ts` 新增体积护栏、`src/tools/index.ts` 注册、新增 2 个测试文件、`smoke-chart.ts` 预览脚本）；**不改**插件侧（`ui/`）、不改线格式（`shared/src/index.ts` 的 `PluginMethod` 与 `createSvgSchema`）、不改 core 写管线
- **相关记录：** 承接 0006 的目录体积口径与 0020 的「不按类型族出工具族」；沿用 0007「不允许静默失效」定回滚与报错出口；i18n 键化沿 0016；平台事实不新增（沿 0032 的取向）；读本地文件与 `jsd_fill_image.sourcePath` 同构（同一信任边界）；不改 0001/0004 写入管线

## 压力

1. **能力缺口是真的，不是「以后可能会变」。** 现有 58 个工具里没有任何一条能把「数据」变成「图」：`NODE_TYPES` 固定 14 类（`shared/src/dicts/node-type.ts`），无 CHART/PLOT；`CREATABLE_NODE_TYPES` 10 类里只有图元。用户说「画一张季度销售柱状图/SVG 折线图」时，只能靠模型自己拿 `jsd_create_rectangle` 一根一根摆——几何（比例、坐标、刻度）全归模型猜，每张图都是一次高方差演出。
2. **三条候选写通道各有硬边界，已逐条核对过代码**（不是传言）：
   - `jsd_create_vector`：`vectorPaths` 只收 M/L/Q/C/Z（`shared/src/schemas/base.ts:333` 的 describe），**且 `platforms: ['jsdesign','figma']`**（`mcp-server/src/tools/create.ts:174`，MG 的矢量是 PenNode 顶点模型）⇒ 拿它画折线/饼图既缺弧，又缺平台。
   - `jsd_html_to_design`：`htmlToDesign.ts` 的 emit 只产 `<rect>` + `<text>`，无 path、无旋转（`emitSvg` 的两条分支）⇒ 折线、饼图、斜向标注都做不出来。
   - `jsd_create_svg` → `core/execute.ts:createSvgNode` → `host.createNodeFromSvgAsync`：原生 SVG 解析，保留 path/渐变/描边，**三平台都有该契约成员**（MG 只有 async 版，0017 已把它统一成 Promise）。这是唯一能表达任意几何的通道。
3. **产出形态有取舍，必须显式选。** 走 SVG 导入得到的是「一个 frame + 解析出来的矢量子树」——保真但语义弱（改某根柱子要进 frame 找 vector、改图例文字要改 SVG 里的 text）。全原生图元则可编辑但表达力受限（弧、曲线做不出，且 MG 连矢量都不能建）。两者都不是完整答案，必须按「哪部分要可编辑、哪部分要保真」划界。
4. **调用方的成本已经可估。** 手工拼一张 3 系列 × 6 分类的柱状图 = 30+ 个节点的一次 `jsd_batch`（或 30 次工具调用），且每次都要重算刻度。这类需求在会话里出现频率高、单次成本大。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 服务端单向编译（纯函数）+ 复用既有两条写通道 | **采用** | 几何只在服务端算一次，模型只给数据；产出走已存在的 `execute` 与 `create_svg`，不新增插件方法、不改线格式 |
| 开放式第二路径：**配方 prompt + `jsd_create_svg` 的文件来源**（几何由调用方自己用 d3 算） | **采用**（次日追加，见变更历史） | 种类无上限（雷达/热力/桑基/瀑布…），且**不新增执行面**：算几何用的是调用方自己已有的执行环境，本进程只多读一个本地文件 |
| 在 daemon 里起 JS 沙箱（`node:vm`）跑模型给的 d3 代码 | 排除 | 收益被「调用方本来就能执行代码」抵消（MCP 的消费方是有 shell 的 AI 工具），代价却是本项目**第一个「执行外部代码」的能力**：超时/死循环/内存/依赖解析都要自己兜，`vm` 又明确不是安全边界。要做也得等真的出现「无执行环境的宿主」这个证据 |
| 只给提示词、让模型手算坐标拼 SVG，不开文件来源 | 排除 | 手算几何正是本决策要治的病（比例/刻度/角度全凭猜），且几十 KB 的 SVG 塞进工具入参既费上下文又易在转义上翻车。开 `svgPath` 的成本是一个 `readFileSync`，与既有的 `jsd_fill_image.sourcePath` 同构 |
| 只改提示词（`tools/prompts.ts` 加一份图表配方） | 排除（降级为兜底） | 零改动、三平台通用，但几何仍归模型算：比例/刻度/饼图角度错是必然，且弧与曲线根本表达不出。本记录把它拆成两半：**固定四种走编译器，其余走代码配方** |
| 每种图表一个工具（`jsd_create_bar_chart` / `_line_chart` / `_pie_chart` …） | 排除 | 撞 0006 的目录体积门禁（`catalog-budget.test.ts`：目录整体 ≤ 400 KB，当前 53+ 工具已在临界）与 0020 的结论「按类型族出工具族属过度设计，成本转嫁调用方」。四种 kind 是**同一个编译函数的一个参数**，不是四个入口 |
| Abstract Factory / Strategy 注册表（按 kind 注册编译器） | 排除 | 命中停止条件：只有一种编译路径、变化无证据。四个 kind 的差异是「标记几何怎么生成」，用函数内分支即可；引入注册表换来的是间接层与「注册顺序」这类新状态。等真的出现「第三方自带图表编译器」再谈 |
| 插件侧新增 op 或图表节点类型 | 排除 | 三平台引擎都没有统一的「图表节点」概念，等价于把几何算进插件、再让插件与 MCP 版本耦合（0020 已把「按平台重定义工具」否掉）；且它不解决表达力问题，只是把同样的 SVG 拼装挪到另一端 |
| 全原生图元编译（方案 C：不出 SVG，全部编译成 RECTANGLE/VECTOR/TEXT 树） | 排除（留作二期） | 可编辑性最好，但折线/饼图受 `vectorPaths` 无弧限制、且 MG 建不了矢量 ⇒ 必须按 0020 的第二档做平台分叉。当前证据不足以承担这份分叉成本；先让「能画对」成立 |
| 纯 SVG 一把梭（整张图含标题/图例都进 SVG） | 排除 | 一旦文字进 SVG，字体、字重、后续改文案全部交给引擎的 SVG 解析器（三平台行为未知，见「验证」的待验项）。骨架原生能把这份不确定性关在门外 |

命中「停止条件」：只有一个实现、变化无证据、语言原生能力（纯函数 + 一次组合调用）足够。

## 结论

**不引入模式。** 一个纯函数编译器 + 一次组合调用 + 一份配方 prompt：

- `compileChart(spec)`（`mcp-server/src/charts.ts`）——无状态、无 IO、无宿主依赖的**单向**编译：声明式 spec → `{ ops, plotSvg, plotOrigin }`。
- `jsd_create_chart`（`mcp-server/src/tools/chart.ts`）——把编译结果按固定次序送进既有通道：`execute`（骨架）→ `create_svg`（绘图区）→ `node_op:reparent` → `move`。
- `chart-by-code` 配方（`mcp-server/src/tools/prompts.ts`）+ `jsd_create_svg` 的 `svgPath` 来源——**覆盖面**的那一半：种类不设上限，几何由调用方用自己的执行环境（d3 的纯计算模块）算好、落盘、再导入。

**两条路径的分工（按优先级）：**

| | `jsd_create_chart`（内置编译器） | `chart-by-code` + `svgPath`（代码生成） |
|---|---|---|
| 覆盖 | 柱 / 折 / 面积 / 饼 四种 | 无上限（雷达 / 热力 / 桑基 / 箱线 / 瀑布 / 双轴 / 误差棒 …） |
| 几何 | 服务端算，**确定、可单测** | 调用方算，一次一个样 |
| 前提 | 无 | 调用方有可执行环境（node） |
| 何时用 | **默认**，尤其形状要稳定、要能复现 | 只在内置种类表达不出、或要精确控样式时 |
| 一致性 | 骨架文字的配色/字号来自 `dicts/chart.ts` | 配方把同一份 dict 的取值插进提示词，两条路出的图外观对齐 |

**分工边界（B′ 的含义，也是最关键的一条）：**

| 组成 | 归属 | 理由 |
|---|---|---|
| 容器 / 标题 / 副标题 / 图例 / 刻度与分类标签 / 数据值标签 | **原生节点**（FRAME / TEXT / RECTANGLE） | 都是「用户一定会改」的东西（改文案、改色、改刻度），必须可编辑；同时把所有文字挡在 SVG 解析器之外 |
| 网格线 / 轴线 / 数据标记（柱 / 折线 / 面积 / 饼片） | **一次 SVG 导入** | 唯一能表达任意几何的通道路径；网格与轴线收进同一个 SVG 是因为「一个 SVG 节点只能整体压在兄弟之上或之下」，靠 reparent 的 `index:0` 沉底即可，不必让绘制顺序依赖一串子节点计数 |

由此 **SVG 里只有几何（`rect` / `path` / `circle`），一个 `<text>` 都没有** —— 这是把「字体/文案可控」与「几何保真」同时拿到的唯一划法。（`chart-by-code` 那条路做不到这一点：文字必须进 SVG，故配方里明确要求显式写 `font-family` 并说明字体不保证按写的走。）

## 实施方案

- **角色与职责**：`compileChart` 只做「spec → 两个产物」的纯计算（可单测、不 mock 宿主）；工具只做「按次序下发 + 失败回滚 + 汇总 warnings」。
- **接口所在层与依赖方向**：编译与工具都在 `mcp-server`（与 `icons.ts` 同层同形：服务端算好 SVG，再走 `create_svg`）；spec 的 schema 与取值字典按既有约定放 `shared/src/{schemas,dicts}`，供工具注册期校验与后续复用。依赖单向：`mcp-server → shared`，不进 `core`、不碰 `DesignHost` 契约。
- **一次调用的时序（固定四步）**：
  1. `execute`：一次性下发骨架 ops 树（单一根 FRAME，子节点按 x/y 绝对定位，不开 auto-layout ⇒ 位置确定、不受引擎重算影响），拿回根 id；
  2. `create_svg`：下发 `plotSvg`（局部坐标系，原点即绘图区左上角）；
  3. `node_op:reparent`：把 SVG 节点移入骨架 FRAME（**必须显式传 parentId**，缺省父级取当前选中、不可靠）；
  4. `move`：把 SVG 放到 `plotOrigin`（相对新父级，页面系换算由 core 内部完成，不用手动摆回）。
  根节点的落位交给既有的 `placement`（缺省居中）。
- **失败即回滚（0007 口径）**：第 2–4 步任一步抛错，best-effort 删掉本次已建的节点后再抛错——画布上要么有一张完整图表，要么什么都没有，不留半成品。回滚失败时把未清理的 id 写进错误文案。
- **第二路径（覆盖面）**：`jsd_create_svg` 增加 `svgPath` 来源——插件线格式（`createSvgSchema`）仍要求 `svg` 必填，来源之争在 MCP 侧的 `createSvgInputSchema` 解完（两者都给/都不给都明确报错），插件不需要具备读盘能力。读盘用 `readFileSync`，与 `jsd_fill_image.sourcePath` 同一做法、同一信任边界；空文件与超限（`MAX_SVG_SOURCE_BYTES`，默认 4 MB，可 env 覆盖）都给可读报错，而不是把引擎的解析错误抛出去。
- **提示词怎么落地**：`chart-by-code` 作为**配方 prompt**（`prompts/list`）发放，而不是塞进工具描述——它只在被调用时进入上下文。配方里的配色/文字色/画布尺寸**从 `dicts/chart.ts` 读**（`CHART_PALETTE` / `CHART_INK` / `CHART_DEFAULT_SIZE`），不手抄，两条路径出的图外观才对齐（0032 的「事实取自数据表」）。
- **扩展点留缝**：kind 是 spec 的一个字段，加一种图 = 在 `compileChart` 里加一个分支，不动接口、不加工具；超出分支能力的需求不必扩 schema，走第二路径。
- **本次不做**：在 daemon 里执行调用方给的 JS（理由见「候选与排除」）、主题/暗色皮肤（配色只开 `palette` + `background` 两个口子）、图例点击联动、坐标轴对数刻度、堆叠柱、数据从文件/URL 拉取（第二路径下由调用方自己读数据）、把图表封装成 COMPONENT 供复用（工具产出后用户可用既有 `jsd_create_component` 自己做，不预先内置）。

## 成本与退出条件

- 成本：新增 1 个工具（目录体积 +1 条；spec schema 用嵌套对象收敛，不出参膨胀）、4 次桥往返/张图（此前手工路径 30+ 次工具调用）、1 个纯函数模块 + 1 个工具模块 + 1 个配方 prompt + `jsd_create_svg` 一处改造 + 2 个测试文件。**不新增**：插件侧代码、线格式枚举、平台能力位、core 职责、**任何 npm 依赖**（第二路径的 d3 装在调用方，不装进本仓）。
- 往返为什么能接受：四次都在同一次工具调用内顺序发生，中间 id 不回传模型，模型上下文成本与 1 次调用等同。
- 退出条件：① 若真机验证发现 SVG 导入在三平台的实际保真度不足以支撑「形状对」（例如 path 填充/描边被丢），退到「全原生图元编译」（方案 C）+ 按 0020 第二档处理 MG；② 若 `create_svg` 侧无法稳定拿回节点 id 完成 reparent，退到「整张图一个 SVG」（方案 B），骨架可编辑性让位；③ 若第二路径实测「模型写的 d3 代码」稳定性远低于预期（大量空图/越界），砍掉配方、只留内置编译器——它不占线格式也不占依赖，删 prompt 与 `svgPath` 即可，没有兼容包袱。三种回退都不需要改接口签名。

## 验证

- 不变量测试（`packages/mcp-server/src/__tests__/chart.test.ts`，纯函数层，不需要宿主）：
  1. **产出形态**：`plotSvg` 内不含 `<text>`；骨架 ops 里所有文字都是 `type:'TEXT'` 且都带 `textAutoResize`（不声明会被引擎的 `resize` 置成 NONE，命中 `buildNode` 的 unapplied 点名）；
  2. **几何不出界**：所有子节点的 x/y/width/height 落在容器内（含 x≥0、x+w≤width）；
  3. **比例正确**：柱高与数值成正比、零值柱最小高度、负值柱从基准线向下；折线各点 y 随值单调、x 等距；
  4. **饼图闭合**：四等分时每片起止点都落在半径上、首片起点回到 -90°，且 path 里**不出现 `A` 指令**（改用 `C` 近似，见上方「为什么不用 A」）；
  5. **图例/配色一致**：饼图图例项 = categories、其余 = series，色块颜色 = 标记颜色（同源取色）；
  6. **值标注留白**：`showValues` 时最高值标注不顶进图例、负值标注不压分类标签（这两处正是实测算错会重叠的地方）；
  7. **边界 spec**：单点数据、全 0（撑开值域，不产生 NaN）、单系列（不画图例）、大数值（刻度 k/M 紧凑写法）、尺寸过小与图例超宽都给可读报错而不是画出负宽高。
- 来源二选一（`packages/mcp-server/src/__tests__/create-svg-source.test.ts`，走真实 executor + stub bridge）：schema 层两者都给/都不给都拒；`svgPath` 确实由服务端读盘后下发；文件缺失/为空是人话报错且**不向插件发往返**。
- 目视验收（`packages/mcp-server/smoke-chart.ts` → `/tmp/chart-preview.html`）：把 ops 树用绝对定位的 HTML 复刻、叠上真实 `plotSvg`，四种图一次排开对照比例与摆位。这是**没有设计客户端时的唯一目视手段**，但它复刻的是 HTML 而不是引擎渲染，不能替代下面的真机项。
- 需要真机验证（本次未验，**属已知未知**，登记在案）：① 三平台 SVG 导入对 `path`（含 C 曲线）、`circle`、`fill-opacity` 的保真差异；② reparent 进入普通 FRAME 后 `move` 的最终坐标是否与 `plotOrigin` 一致（回读 `jsd_find` 复核）；③ 骨架 TEXT 未传 `fontName` 时按当前字体渲染，三平台是否都正常（`textWriter` 已按 0007 在结果里点名失败项）；④ 导入的 SVG 根节点**是否自带白底**（`background` 设成深色时绘图区会不会还是白的——`create_svg` 没有控制它的入参）。
- 指标与日志：工具失败时保留回滚情况与未清理 id（走既有 `error()` 落盘 `/tmp/text-to-design-mcp.log`）；结果 `warnings` 透传插件侧的点名；`svgPath` 的读失败/为空/超限文案都在结果里，逐条可追。
- 回归门禁：`pnpm typecheck`、`pnpm vitest run`（新增 2 个文件 + 既有 i18n/目录体积/属性派发等不变式）、`pnpm build`；改 `mcp-server/` 后需**重启常驻 daemon** 才验证得到新产物。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-10-09 | 初次决策（用户已在四个方案里选定 B′：骨架原生 + 绘图区 SVG） | 不引入模式；服务端单向编译 + 复用 `execute` / `create_svg` 两条既有通道，工具数 1 |
| 2026-10-09 | 「四种图太少」：希望提示词引导模型用 d3 写代码、导出 SVG | **结论不变**（仍不引模式、不新增插件方法与线格式）。原「只改提示词的方案」拆成两半落地：固定四种仍走编译器；**其余种类走配方 prompt + `jsd_create_svg` 新增的 `svgPath` 文件来源**（几何由调用方用自己的执行环境算，本仓不装 d3、也不执行外部代码）。新增排除项：daemon 内 `node:vm` 沙箱（收益被「调用方本就能执行代码」抵消，代价是本项目第一个「执行外部代码」的能力） |
