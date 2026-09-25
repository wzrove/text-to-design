# 0025. Figma 补上组件属性的**定义**入口：一个 op 承担「定义 + 绑定」，不照搬 MG 的四段式

- **状态：** 已采纳（**Figma 真机已复验**，2026-09-25 插件重载后）
- **日期：** 2026-09-25
- **影响范围：** `ui/src/code/figma/ops.ts`、`ui/src/code/figma/sync-guarantee.ts`、`mcp-server/src/tools/nodes.ts`（描述补正）、`mcp-server/src/tools/platform.ts`（platformNote 指针补全）、`packages/mcp-server/README.md`
- **相关记录：** 0007（不许「回显成功实则没生效」）、0019（MG 组件属性管理）、0020（平台差异不重定义工具）、0023（组件属性读形态 ≠ 写形态）

## 压力

2026-09-25 把复刻稿的重复结构组件化：`chip/code`（4 实例）与 `row/suggestion`（3 实例）都成了，但**侧边栏导航项**（图标 + 文案）和**页眉/动作图标按钮**做不了 —— 它们的重复单元含一个**因行而异的图标**，正确做法是组件上开一个图标插槽（`INSTANCE_SWAP` 组件属性），再让每个实例换图标。

- **能力缺一半**：Figma 侧只有 `figma_component_properties_set`（**设**实例的属性值），**没有任何入口能定义属性**。定义能力只在 MG 有 —— `mg_add_component_property` / `mg_edit_component_property` / `mg_bind_component_property` / `mg_delete_component_property`（`ui/src/code/mastergo/ops.ts:634-675`）。
- **试过的变通（已记账，指纹 `3d0aa90bb7e5`）**：组件里放一个透明占位图标，每个实例删占位、插正确图标。最小验证第 6 步即被引擎拒绝：
  `in insertChild: Cannot move node. New parent is an instance or is inside of an instance` —— Figma 硬性禁止往实例里加子节点。变通方案不成立。
- **第二处、更普遍的坑**：`jsd_reparent_nodes` 的描述只写「把节点移入 parentId 成为其子节点」，**没写实例不能当 parentId**。照描述做必然撞上面那条报错。

Figma typings 事实（`@figma/plugin-typings` 1.137.0 `plugin-api.d.ts`）：

| 事实 | 位置 |
|---|---|
| `ComponentNode.addComponentProperty(name, type, defaultValue, options?)` → 返回**带唯一后缀**的属性名（如 `Icon#0:0`）；支持 `BOOLEAN \| TEXT \| INSTANCE_SWAP \| VARIANT \| SLOT` | `:9611` |
| `editComponentProperty` / `deleteComponentProperty` 存在 | `:9624` / `:9641` |
| 属性要**真的驱动某个子层**，还须在该子层写 `componentPropertyReferences`；键只收 `visible \| characters \| mainComponent` | `:6431` |
| `ComponentPropertyOptions = { preferredValues?: InstanceSwapPreferredValue[] }`；`InstanceSwapPreferredValue = { type: COMPONENT \| COMPONENT_SET, key }` | `:10997` / `:10983` |
| `setProperties` 的键**必须**是带后缀的属性名（TEXT/BOOLEAN/INSTANCE_SWAP） | `:11113` |

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 照搬 MG 的四段式（add / edit / bind / delete） | 排除 | MG 必须拆出 `bind`，是因为 MG 的**内部子层 id 拿不到**（所以它另配了 `mg_list_sublayers`，见该 op 描述）。Figma 的子层 id 用 `jsd_find` 直接可寻（`chip/code` 的 label 就是这么拿到的）。拆开只会让调用方多一次往返，并留下「属性定义了但没绑、驱动不了任何东西」的中间态 —— 正是 0007 要根除的形状 |
| 只加 `add`、不做绑定 | 排除 | 同上：产出的是空壳属性，回显成功但什么都不驱动 |
| 把定义能力并进 `figma_component_properties_set` | 排除 | 0023 刚立「读形态 ≠ 写形态要单点映射」；让同名 op 同时承担「定义」与「设值」两种语法，正是那条决策要避免的混装 |
| **采用**：一个 op，`sublayerId` 给了就连带绑定 | 采用 | 定义与绑定在 Figma 上是同一次调用能完成的事，合并后没有中间态，也不新增 op 数量 |

## 结论

**不引入模式** —— 这是「沿用 0020 立下的 platformOps 通道加一个 op」，第 6 个 Figma op，既有机制（`figmaOps` 数组 + `jsd_platform_op` 分发）直接承载。

四个具体口径：

- **一个 op，不是四个**：`figma_component_property_add`，收 `{ componentId, name, type: BOOLEAN|TEXT|INSTANCE_SWAP, defaultValue, preferredValues?, sublayerId? }`。`sublayerId` 存在时同时写该子层的 `componentPropertyReferences`。
- **绑定槽由类型推导，不做成参数**：`BOOLEAN → visible`、`TEXT → characters`、`INSTANCE_SWAP → mainComponent`。不暴露 slot 参数的理由：MG 的 wire 词汇是 `isVisible`、Figma 引擎键是 `visible`，一旦做成参数就得在调用方暴露两套词汇；推导掉就没有这个岔路（与 0023「一份形态知识只写一处」同源）。
- **前置拒绝 `VARIANT` / `SLOT`**，文案点名原因：`VARIANT` 由变体集的变体名派生（不是这么建的）、`SLOT` 不在 `componentPropertyReferences` 的三个可绑键里。两者都会「建好了但驱动不了」，宁可拒绝也不留静默空壳。
- **回读校验走子层的 `componentPropertyReferences`**（对齐 `mg_bind_component_property` 的做法与 0007）。**不读 `componentPropertyDefinitions`** —— 它在 dynamic-page 下的同步读取有受限风险，校验不该依赖它；`addComponentProperty` 的返回值本身就是带后缀的属性名，直接回传。

## 最小落地

1. `ui/src/code/figma/ops.ts`：新增 `componentPropertyAddSchema` + run + `figmaOps` 条目 `figma_component_property_add`；
2. `ui/src/code/figma/sync-guarantee.ts`：`SupersetPresenceCheck` 增 `'addComponentProperty'`（Figma 必须有据，同 0021/0022 口径）；
3. `mcp-server/src/tools/nodes.ts`：`jsd_reparent_nodes` 描述补一句实例约束（见下）；
4. `mcp-server/src/tools/platform.ts`：`jsd_platform_op` 的 platformNote 补 Figma 侧指针（原文只说「MG 上新增组件属性用 mg_add_component_property」，Figma 侧会显得没有入口）；
5. `packages/mcp-server/README.md`：`jsd_platform_op` 行的能力列举补「组件属性定义」。

第 3–5 条是本次同一根约束的**调用方可见面**，属单点文案（单文件、单字符串），按仓库规矩直接改、不另立决策记录 —— 记在本条的最小落地里，避免 INDEX 被琐碎条目灌满。

## 成本与退出条件

- **成本**：Figma op 从 5 个增至 6 个；调用方要先 `jsd_find` 拿子层 id（多一轮往返，但那本是 Figma 上就有的能力）。**无新模块、无新抽象。**
- **退出条件**：
  - 若 Figma typings 撤掉 `addComponentProperty`，改用直接写 `componentPropertyReferences`（那时本 op 的 add 半边退化成一个赋值）。判据是编译期断言 `SupersetPresenceCheck` 变红。
  - 若出现「改属性默认值 / 删属性」的**真实需求**，再按 MG 的形状补 `edit` / `delete` —— **不复用本文的合并口径**：那两项没有「绑定」半边，合并无意义。
- **不做 `edit` / `delete` 的理由**：本轮无证据需求；为「未来可能」造 op 是 0020 明确否掉的形状。

## 验证

- 静态：`pnpm run typecheck` + `pnpm run test` + `pnpm build`。
- 编译期：`SupersetPresenceCheck` 断言 Figma 运行时确有 `addComponentProperty`。
- 真机（Figma，**插件重载后**）：建一个含图标占位 + 文案的组件 → `figma_component_property_add`（`INSTANCE_SWAP`，绑到占位子层）→ `jsd_create_instance` → `jsd_set_instance_properties` 换图标 → 实例图标随之变；同组件建第二个实例换另一个图标，两者互不影响。
- 拒绝路径：`type: 'VARIANT'` / `'SLOT'` 应报错并点名原因。
- 回归：原用例 `case-20260924-0005` 步骤重放。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-09-25 | 组件化复刻稿时撞到「Figma 只能设属性值、不能定义属性」，变通方案被引擎拒绝 | 采用「一个 op 定义即绑定」，不照搬 MG 四段式 |

### Figma 真机复验（2026-09-25，插件重载后，run `run-20260924T175129Z`）

用途不是「跑通一个 op」，而是把复刻稿的导航项真正组件化 —— 用得上才算验证。

| 步骤 | 结果 |
|---|---|
| `figma_component_property_add`（`type: INSTANCE_SWAP`，绑组件内的图标实例） | ✅ 回包 `{propertyName: "Icon#1039:0", boundSublayerId: "1039:363"}`，回读校验通过 |
| 同上（`type: TEXT`，绑组件内的文本） | ✅ 回包 `{propertyName: "Label#1039:1", boundSublayerId: "1039:362"}` |
| 6 个导航项实例各换图标 + 改文案（`jsd_set_instance_properties`，键用带后缀的属性名） | ✅ 6 个实例图标各不相同、文案各不相同；**宽度随 auto-layout 自适应**（82→54/68 实测），证明 TEXT 属性真的驱动了文本 |
| 组件 `row/nav-item` | 图标插槽 + 文案插槽都活；改主组件几何 → 6 个实例全跟 |
| 导出目视复核（`jsd_export` 整稿 + 单独 `主区`） | ✅ 与参考截图一致 |

顺手暴露的一个**造法坑**（已写进用例 `case-20260924-0005` 第 10 步）：拿画布上现成的节点当组件 master，
那个节点会离开原位 —— 本轮 `i-hdr-doc`（页眉文档图标）与 `i-hdr-chev`（页眉下箭头）被 reparent 进图标组件后，
页眉留了两个洞，靠单独 `jsd_export` 主区才看出来。**当 master 的节点必须在原位置补一个实例。**

未决：`edit` / `delete`（见「退出条件」，无证据需求）。
