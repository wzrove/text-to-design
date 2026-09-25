# 0019 MasterGo 平台特有操作:组件属性管理(补上 Figma 那一档的空缺)

- 状态:已采纳（代码已落地并通过类型检查/不变式测试/构建；真机复验：加/改/删已跑通，见下）
- 日期:2026-09-24
- 相关:[0017](0017-第三平台MasterGo接入：门面投影加契约两处异步化.md)（第三平台接入）、[0018](0018-实例变体写入：MG上改为集合内换绑加回读校验.md)（变体写入）、0010（契约纪律）、0007（不允许静默失效）

## 压力

0017/0018 联调时反复撞到同一面墙：**MasterGo 上「读组件属性」能读、「建组件属性」没有任何入口**。

- 真机实测：`frame + 文本子节点` → `jsd_create_component` → 组件与实例两侧属性表都是**空**
  （MG 不会像 Figma 那样把子文本自动暴露成 `TEXT` 属性）；
- 于是 `jsd_set_instance_properties` 的布尔/文本/换绑路径**永远测不到、也用不了** ——
  调用方看得见属性类型（投影已通），却没有任何办法造出第一个属性；
- Figma 侧早有 `figma_component_properties_set` 等 4 个平台 op（`jsd_platform_op` 通道），
  MasterGo 的 `meta.platformOps` 一直是**空数组** —— 能力档位不对等，不是实现深度问题。

即：这是「能力缺口」而非「映射差异」，修法必然新增平台 op（新文件 + 注册 + 工具归属 + 记账），
跨 `ui/`、`mcp-server/`、技能文档多包。

## 候选与排除

| 候选 | 排除理由 |
|---|---|
| 把「建属性」塞进通用工具（如给 `jsd_create_component` 加 `properties` 入参） | 该能力**只有 MG 的组件节点有**（Figma 的 `addComponentProperty` 语义/形状不同），塞进平台无关工具会把平台差异漏给调用方；Figma 已有的先例是走 `platformOps` |
| 让调用方去设计器里手工加属性 | 能测通，但那是**把工具面的缺口转嫁给用户**；联调时已被迫用过一次，不可作为交付形态 |
| 只加 `add_component_property` 一个 op | 建了改不了、删不掉 —— 组件属性是「增删改」一体的（typings `ComponentPropertiesMixin` 三个方法成套） |
| **补三个 op：add / edit / delete**（采纳） | 与 Figma 的 op 档位对齐；每个都带**回读校验**（本平台有「回包成功、值没变」的前科） |
| 顺带把变体集管理（`createVariantProperties` / `editVariantPropertyValues` / `createVariantComponent`）也加上 | **本轮不加**：语义未实测（三者如何配合产生「第二个变体值」不清楚），加了就是猜。当前造变体值仍用已验证的「成分改名」法（见 0018） |

## 结论

新增 `packages/ui/src/code/mastergo/ops.ts`，导出 `mastergoOps: PlatformOp[]` 并挂进
`mastergo/meta.ts` 的 `platformOps`（原为 `[]`）：

| op | params | 实现(typings 行号) | 回读校验 |
|---|---|---|---|
| `mg_add_component_property` | `{ nodeIds, name, type: BOOLEAN\|TEXT\|INSTANCE_SWAP, defaultValue, preferredValues? }` | `ComponentPropertiesMixin.addComponentProperty`(3003) | 读回 `componentPropertyValues`，必须出现该属性且类型一致 |
| `mg_edit_component_property` | `{ nodeIds, propertyId, name?, defaultValue?, preferredValues? }` | `editComponentProperty`(3011) | 读回该 id 的 `name`/`defaultValue` 与请求一致 |
| `mg_delete_component_property` | `{ nodeIds, propertyId }` | `deleteComponentProperty`(3028) | 读回确认该 id 已消失 |
| `mg_bind_component_property` | `{ nodeIds(子图层), componentId, propertyId, slot: characters\|isVisible, unbind? }` | `SceneNodeMixin.componentPropertyReferences`(2406–2410,可写) | 读回 `componentPropertyReferences[slot]` 与请求一致(解绑则确认已移除) |

**为什么第 4 个是必需的**(真机逼出来的):只 `add` 出来的属性**不驱动任何东西** ——
要让「文本内容 / 显隐」真的跟着实例属性走,必须在**组件内部那个图层**上写
`componentPropertyReferences`。这也是「实例侧属性表读不到值」的另一面:值体现在被绑定的
图层上(判据要读那个图层的 `characters` / `isVisible`,而不是读实例属性表)。

配套改动：

- `mcp-server/src/tools/platform.ts`：`jsd_platform_op` 的 `platforms` 由 `['figma']` 改成
  `['figma','mastergo']`，`platformNote` 同步（否则 daemon 会在到达插件前就拦掉 MG 的 op —— 实测过）。
- 读回一律走**门面的投影**（`componentProperties`，实例侧 `componentProperties` /
  组件侧 `componentPropertyValues` 两条路，见 0017 复核节），不在 op 里二次解析宿主原始形状。
- 错误一律抛（不静默）：op 分发层把异常转成结构化错误，调用方能看见「哪一步、什么原因」。
- 删除 0017/台账里「工具面暂无 `addComponentProperty` 入口」的表述 —— 该结论**已被本决策推翻**。

### 四次复验:绑定与写入**都通了**(前一轮的「做不到」是误判,已撤回)

上一轮把「绑定报 `symbol sublayer`」归因为「平台不透出 symbol 内部结构」——**错了**,两个真因都在我们这侧:

1. 本仓 `create_component` **只建空壳**(`core/component.ts` 注释:子层由调用方 `reparent` 归组),
   空组件里自然没有「symbol sublayer」→ 引擎报的是这个;
2. 搜索用的是 `findChildren`(**直接子层**语义),而要绑的 TEXT 在 FRAME 里一层 →
   该用 `findAll`(typings 2424,**深度**,与 Figma 同语义)。

按正确用法重跑(组件里先 reparent 进 frame+text,再用 `mg_list_sublayers` 深度枚举):

| 步骤 | 结果 |
|---|---|
| `mg_list_sublayers(组件)` | ✅ `source:"findAll(含后代)"`,2 个:`CX-label(TEXT, characters="原文案")`、`CX-box(FRAME)` |
| `mg_bind_component_property {target:{type:'TEXT'}, slot:'characters'}` | ✅ `bound:[{nodeId:'20:541', slot:'characters', propertyId:'20:554'}]` |
| 同上 `slot:'isVisible'` | ✅ 绑定成功 |
| 建实例后读绑定层初值 | ✅ `字符="默认文案"`(= 属性默认值 → **绑定确实在驱动图层**) |
| 写 `{文案:'改过的文案', 显示图标:false}` | ✅ 写后回读该层:`characters="改过的文案"`、`isVisible=false` —— **写路径真落盘** |
| 去假阴性后复跑(插件重载) | ✅ 脚本自洽输出:`✅ 绑定层跟随了属性("默认文案"→"改过的文案", visible true→false)` |

**顺带修掉一个假阴性**:门面原先拿实例侧 `componentProperties` 做写后回读校验,而 MG 那张表
不可靠(同一实例写前报得出、写后回空表,而绑定层明明变了)→ 会误报「写入后回读不一致」。
现改为**不做实例侧判定**,只在明显不一致时留开发者日志;确认生效的判据统一为
`mg_list_sublayers` 读绑定图层。实例内部的图层 id 形如 `实例id/层id`(`20:558/20:541`)。

### 三次复验(已撤回):当时的误判与教训

`mg_bind_component_property` 真机报引擎精确错:`Can only set component property references on
symbol sublayer` —— 绑定目标必须是**组件内部的 symbol 子层**。而那个子层 id **读不到**:

| 读法 | 普通 frame(对照) | COMPONENT / INSTANCE |
|---|---|---|
| `jsd_find {ids, depth:1..3[, recursive]}` | ✅ `children:["20:488"]` | ❌ 无 `children` 字段 |
| `jsd_find {type:'TEXT'}`(走 MG 自己的 `page.findAll()`) | ✅ 含子文本 | ❌ 组件/实例内部的文本一次都没出现过 |

当时的推断是「MG 不向插件暴露 symbol 内部结构」。**该结论已作废**(见上一节):`children` 确实读不到,
但 `findAll` / `findChildren` 可用;真正的原因是组件是空壳 + 搜索深度不够。
保留这段是为了记住教训:**报错先确认自己的前置条件**,别急着把锅推给平台 —— 那会写出错误的台账,
比没有台账更坏。

## 影响范围

- `ui/src/code/mastergo/ops.ts`（新）、`ui/src/code/mastergo/meta.ts`（`platformOps`）
- `mcp-server/src/tools/platform.ts`（平台归属与文案）
- `.agents/skills/mcp-tdd/references/platform-limits.md`（「组件侧属性表为空」一行的口径改为
  「用 `mg_add_component_property` 建属性，别去设计器手加」）
- `docs/design-decisions/{0017-*.md,INDEX.md}`（交叉引用与本决策的索引行）

## 真机复验（2026-09-24，插件重载后）

| 步骤 | 结果 |
|---|---|
| `jsd_ping` 列出三个 op | ✅ `platformOps: [{name:'mg_add_component_property',…}, …]`（插件侧已声明） |
| `mg_add_component_property {type:'BOOLEAN'}` | ✅ `{ok:true, data:{created:[{nodeId:'20:393', propertyId:'20:395'}]}}` —— **宿主真的返回 propertyId** |
| `mg_add_component_property {type:'TEXT'}` | ✅ 同上（`20:396`） |

**复验当场暴露三个问题（都已修）**

1. **表键取错了**：MG 的属性项**同时有** `name`(`显示图标`)与 `id`(`20:395`)，门面原来**优先取 id** →
   调用方按名字写值/改属性/删属性一概匹配不上，连「同名重复添加」的检查都失效
   （实测重复添加返回了 `ok:true`）。改为**名字优先、id 兜底**，并把 id 留给写入侧现查现换
   （`remapPropertyIds` 本来就是干这个的）。
2. **`jsd_find` 读组件属性恒为 `undefined`**：序列化器用 `'componentProperties' in node` 判有没有，
   而门面的 `has` 陷阱只认契约名 —— MG 组件用的是 `componentPropertyValues`，`in` 返回 false，
   于是整个字段被跳过（值其实读得到）。`has` 现在两条宿主来源都认。
3. **实例侧回读会假阴性**：MG 的实例 `componentProperties` 即便组件已有属性也是**空表**
   （值读不回来）。原来的回读校验会把「空表」判成「写失败」。改为**只校验实例表本来报得出的键**，
   判不准就不报错（名字不存在那条硬判据仍在，不会静默放行）。

另：`jsd_platform_op` 的 `platforms` 之前漏改（`['figma']` 没加上 `mastergo`），
导致 op 明明在 ping 名单里、daemon 却按平台拦掉 —— 修法是读**源码实际文本**再改一次
（第一次用脚本替换时没加断言，静默没生效；这条教训值得记：改关键串要断言）。

### 二次复验(名字优先 + `has` 修复后)

| 步骤 | 结果 |
|---|---|
| `mg_add_component_property` BOOLEAN/TEXT | ✅ 返回 `{name:'显示图标', propertyId:'20:414'}` 等(名字与 id 都给) |
| 组件侧读回 | ✅ `componentProperties={"显示图标":{…},"文案":{…}}` —— `has` 修复后 `jsd_find` 能看到了 |
| 同名重复添加 | ✅ 明确报错并列出 `显示图标(id 20:414)、文案(id 20:415)` |
| `mg_edit_component_property` 改名 + 改默认值 | ✅ 回读 `标题文案:{type:'TEXT',value:'新默认'}`(宿主确实收 id) |
| `mg_delete_component_property` | ✅ 回读只剩一条;再删报 `组件没有属性「显示图标」` |
| 写实例属性 | ⚠️ 回包成功,但**实例侧属性表恒为空** → 无法据此判定;改用「绑定图层是否变化」当判据(见下) |

## 未决 / 待验

**已核实(本轮)**

- ~~写实例值的可观测性无法自证~~ **已解决**:`mg_list_sublayers` 读绑定图层(`characters`/`isVisible`)。
- **`slot` 枚举漏了 `mainComponent`** —— `componentPropertyReferences` 有三个槽(typings 2409),
  我最初只写了 `characters`/`isVisible`,导致「配 INSTANCE_SWAP 换绑」根本传不进来(真机报参数校验失败,自己拦的)。已补。
- **内层实例子层读不到 `mainComponentId`**(外层实例可以)→ 判「换绑成功没有」只能看**尺寸差**,
  故 `mg_list_sublayers` 输出补了 `width`/`height`(判据本身也校正过两轮,见下)。
- 0018 那条「MG 运行时不给 `id`」已收窄(只对实例侧成立),见 0018 变更历史。

**`INSTANCE_SWAP` 专项核实（2026-09-24，真机；结论已更正）**

**最终结论：写值生效，取值 = 组件 id；`ukey` 无效。**

| 项 | 结果 |
|---|---|
| `defaultValue` 收什么 | ✅ **组件 id**（读回 `{"图标":{"type":"INSTANCE_SWAP","value":"20:694"}}`） |
| `preferredValues: [{type:'COMPONENT', key}]` | ⚠️ 调用被接受（`ok:true`）但读回里没有该字段 → 不落库（或存在读不到的地方）。注：脏 `type` 试探是被**我们自己的 zod schema** 拦的，不算 MG 的校验 |
| `slot:'mainComponent'` 绑定 | ✅ `bound:[{nodeId:'20:730', slot:'mainComponent', propertyId:'20:734'}]` |
| 写值换绑（值 = 组件 id） | ✅ **生效**：写 `{图标: <compB id>}` → 内部矩形 `SW3-A/60` → `SW3-B/140`；回写 A 的 id 同样变回 `SW3-A/60` |
| 写值（值 = 组件 `ukey`） | ❌ **无效**：写 `compB.ukey` 后仍是 `SW4-A/60`（参数过了、没换） |

**上一轮判「未生效」是判据错了 —— 第二次同类教训，值得记**：
换绑**不改变实例自己的尺寸**（实测：直接 `jsd_swap_component` 把内层实例换到 140 宽的组件，
读回该实例仍是 60 宽）。我最初拿「内层实例 width」当判据 → **功能明明是好的却判成坏**。
正确判据是**读内部子层**：`mg_list_sublayers` 回读里面矩形的 `name`/`width`（`SW3-A/60` ↔ `SW3-B/140`）。

**取证顺序（今后照抄）**：先跑**正对照**（用已确认可用的路径做一次同样的变更，确认判据能测出差异），
再判被测路径。本轮 v3 就靠「直接 swap 正对照成立」才发现 v2 的结论是假的。
typings 的 `PublishableMixin.ukey`(1805) 与 `InstanceSwapPreferredValue{key}`(3005) 只说明**换绑候选**
用 key 表示，不代表**写入取值**要 key —— 实测取值是 id。

**代码侧顺带修掉的真 bug**：`setProperties` 的键按 typings 3097 应是 **propertyId**，而键归一
`remapPropertyIds` 原来只喂**实例侧** `componentProperties`（MG 上实测常为空表）→ 归一等于没做、
属性名原样发给宿主。现改为两张表都喂（主组件侧 `componentPropertyValues` 优先，它带 `id`）。

**仍待验**

- 上述假设:用 `ukey` 作 `INSTANCE_SWAP` 取值能否真正换绑(需先补 `ukey` 回显);
- 内层实例(`实例id/层id`)读不到 `mainComponentId`,换绑判据只能靠尺寸差 —— 有更直接的读法再换。

**范围外(要做需另开决策)**

- 变体集管理:加维度(`createVariantProperties`)、改值(`editVariantPropertyValues`)、加成分
  (`createVariantComponent`)—— 目前仍走已验证的「成分改名」法。

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-24 | 新建；补 `mg_add_component_property` / `mg_edit_component_property` / `mg_delete_component_property` 三个 op，`jsd_platform_op` 归属加 mastergo |
| 2026-09-24 | 复验后修三处（表键改名字优先、`has` 陷阱认两条宿主来源、实例回读改保守判定）；补第 4 个 op `mg_bind_component_property`（属性不绑定就不驱动图层） |
| 2026-09-24 | ~~三次复验定论：MG 不向插件暴露内部子层~~ **已撤回**（见四次复验）|
| 2026-09-24 | 四次复验：`findAll` 深度枚举 + 组件先 reparent 装子层 → 绑定与写实例属性**全部通过**（绑定层 `characters`/`isVisible` 跟随）；撤回上一轮的误判；门面去掉不可靠的实例侧回读校验；新增 `mg_list_sublayers` |
| 2026-09-24 | 核实未决项：修 `slot` 枚举漏 `mainComponent`；`mg_list_sublayers` 补 `width`/`height` 与实例子层的 `mainComponentId`；收敛未决清单 |
| 2026-09-24 | `INSTANCE_SWAP` 专项（结论已更正）：取值 = **组件 id**，写值**生效**；`ukey` 无效；上一轮「未生效」判据错了（换绑不改实例尺寸，要读内部子层）；顺带修 `remapPropertyIds` 只喂实例侧空表的 bug |
