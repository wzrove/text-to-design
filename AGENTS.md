# text-to-design (jsDesign MCP) 开发 & 使用须知

本文档供维护 `packages/mcp-server` 的开发者，以及通过 `text-to-design` MCP 操作即时设计画布的 AI 智能体参考。

## 一、MCP 调用方（画布操作 AI）规避的坑

当前 MCP 服务端（`packages/mcp-server`）与插件 bridge 存在以下已知行为，务必避开：

1. **`jsd_create_nodes` 忌 `children` 深嵌套 + `layout` 同传**
   - 原因：嵌套 children 时插件端 `appendChild` 到失效根页节点（日志典型报错
     `in appendChild: The node with id "2:1" does not exist`），返回 `ok=false`。
   - 规避：先建 Frame / 叶子节点（flat），再用 `jsd_manage_nodes reparent` 归组；
     `layout`/`layoutMode` 不要直接写进 `jsd_create_nodes` 的 `frame` 入参，建完用
     `jsd_update_node` 单独设。

2. **`jsd_manage_components create_component` 现在是"建空壳"**
   - 已改：create_component 只创建空的 COMPONENT 并返回 id，**不再**把传入节点卷进
     wrapper（旧版卷进会导致删 wrapper 后引擎残留 dangling 失效节点，读整图时崩
     `in get_layoutGrow: Cannot read properties of undefined (reading 'jsGet')`）。
   - 用法：先 create_component 拿 id，再用 `jsd_manage_nodes reparent` 把子节点归组进
     该组件（对齐坑#1 的 flat + reparent 纪律）。

3. **`jsd_manage_components combine_as_variants` 基于副本**
   - 已改：合并前对每个 COMPONENT 做 clone，用副本合并进 SET，原组件保留在页面上。
     删 SET 只删副本，不会动原组件、不残留。注意返回值里的组件 id 是**副本** id。

4. **删除"装有 reparent/group 进来的子节点"的父级前,先搬出子节点**
   - 危险操作：直接 remove 一个父级，会连坐删除其 reparent 进来的子节点，老父链可能
     残留 dangling（现象同上 `jsGet undefined`，且影响整图 `jsd_find`/`reparent`）。
   - 规避：删父级前先用 `jsd_manage_nodes reparent` 把要保留的子节点搬到页面/其他父级；
     若已出现 `jsGet undefined` 报错，先跑 `jsd_manage_nodes repair` 清理残留。

5. **`jsd_manage_nodes repair` 自愈**
   - 遍历当前页，把读取失败的失效节点直接删除，返回清理的 id 列表。
   - 任何 `jsGet undefined` / `ok=false` 且 find 复核异常的场合,先跑 repair 再重试。

6. **失败表现**：插件返回 `{ok:false, error}` 时，服务端现在会返回
   `structuredContent`（schema-valid 空形状）+ `isError:true` + 文本错误原因
   （修复前是 opencode 报 `output schema but no structured content was provided`）。
   调用方可从 `structuredContent` 的空字段 + `text` 里的 `错误:` 定位原因。

7. **失败后的处理**：看到某 op `ok=false` 时，重试前先用 `jsd_find` 复核目标节点
   id 是否仍存在（可能已被 wrapper 连坐删除），必要时先 `jsd_manage_nodes repair`。
   - 已加固：`findNode`（`packages/shared/src/core/utils.ts`）现在对每个节点做 `trySerialize(node,0)`
     校验，悬挂节点**自动静默剔除**（不返回、不删除），op 不会再抛
     `Cannot read properties of undefined (reading 'type')` 这类裸崩，只会回
     「没找到 X 节点」。若目标 id 报「没找到」，说明已失效，先 `repair` 再 `jsd_find`
     复核。注意 `isUsable` 只过滤，不删节点（删职归一 `repair`）。

8. **`jsd_create_nodes` / `jsd_manage_nodes` 的 GROUP**
   - `jsd_create_nodes type=GROUP`: 将子节点归为一组, 内部用 Frame 实现, **支持 auto-layout**
     (`layoutMode`/`itemSpacing`/`padding*` 等)。序列化返回 `type: 'FRAME'` 是正常的。
   - `jsd_manage_nodes op=group`: 将已有节点 (按 id) 归组, 同样用 Frame 实现, 支持 auto-layout 参数
     (`layoutMode`/`itemSpacing`/`padding*`/`primaryAxis*`/`counterAxis*`)。
   - 运行时 `GroupNode` **无** auto-layout 能力, 故 group 统一用 Frame 替代。
   - 需要自动布局的分组 → `layoutMode: 'HORIZONTAL'|'VERTICAL'` + 可选 padding/itemSpacing
   - 纯视觉归组(无布局) → 不加 `layoutMode` 即可
   - `op=ungroup`: 有 auto-layout 的 Frame → 取消 layoutMode; 纯 GroupNode → ungroup()

9. **插入图标用 `jsd_create_icon`，别手写 SVG**
   - 基于 Lucide（1764 图标），服务端本地 `src/icons.ts` 生成 SVG，走 `create_svg`
     通道，**数据不占模型上下文**（Fuse 索引 + 图标库全在服务端）。
   - `icon` 支持精确名（`house`）/ 别名（`home`）/ 模糊与语义联想（`magnifier`→
     `search`）。查无时错误信息里带候选名，按提示重试即可；图标名以 Lucide 官方案
     名为准（如家是 `house` 非 `home`）。

10. **平台特有操作走 `jsd_platform_op`（能力探测先行）**
    - 平台特有能力（当前仅 Figma：变量/本地样式/组件属性）走通用通道
      `jsd_platform_op {op, params}`，先 `jsd_ping` 看 `platform` + `capabilities`
      确认当前平台支持，再挑 op（`figma_variables_create` / `figma_variables_apply`
      / `figma_style_apply_by_name` / `figma_component_properties_set`），参数
      结构见各 op 描述；传错形状会在插件侧回「参数校验失败(op): 字段: 原因」。
    - 平台不支持会回「平台不支持操作: xxx」；jsDesign 上这些 op 恒不可用。
    - `figma_style_apply_by_name` 只支持**本地样式**按名查找；团队库样式无法
      按名检索，不在支持范围。
    - 字段级超集（`textTruncation`=`DISABLED|ENDING`、`maxLines`、`fillStyleId` 等）
      走普通 `jsd_update_node`/`jsd_create_nodes`，jsDesign 上被 `'in'` 守卫静默忽略，
      不报错但也不生效——LLM 应从 `jsd_ping` 的 `platform` 判断哪些字段可信。

## 二、服务端实现要点

- 「structured / err 空形状来自于 zod outputSchema 自动推导」：
  - `src/index.ts` 中的 `emptyFor(schema)` 根据 zod schema（`_def.typeName`）递归生成
    空值（object→递归 shape、array→`[]`、enum→首值、union→优先空数组分支 等）。
  - `err(e, schema)`、`structured(data, schema?)` 在失败 / 畸形数据时兜底输出
    schema-valid 的 `structuredContent` + `isError`，避免 opencode 端
    "output schema but no structured content was provided"。
  - 所有 handler 的 `outputSchema` 必须传给 `structured()` / `err()` 第二参，别漏。

- 日志：运行日志在 `/tmp/text-to-design-mcp.log`（插件端每请求一行
  `发出请求/响应 ok=…/error=…`），排查首选。

## 三、验证命令（不产出编译产物）

- 类型检查（只查不产出）：`pnpm run typecheck`（即 `tsc --noEmit`）。
- 本地起服务：`pnpm start:dev`（tsx）。
- 正式构建：`pnpm build`（vite ssr）——仅在需要更新 `dist/index.js` / 发布时执行。