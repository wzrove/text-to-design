---
"text-to-design-ui": minor
"text-to-design-mcp": minor
---

feat: 批量编排支持名字寻址资源、变量一次绑多组、组件属性值绑变量

- `jsd_batch` 占位符新增资源寻址:`{{@comp:名称}}` 取组件/变体集 id、`{{@var:名称}}` 取变量 id,按 `jsd_get_page` 的资源清单每批最多读一次;零命中或多命中同名都点名中止整批,不猜。
- `figma_variables_apply` / `mg_variables_apply` 改为一次吃 `bindings: [...]`,一组 = 一个变量 × 一个字段/槽位 × 一批节点(旧的单组扁平入参**不再收**);Figma 的 `boundProperty` 按 typings 分三档入口,表外字段(`backgrounds` / `variantProperties` / `componentProperties`)当场点名拒并给替代路径。
- 组件属性的值可跟随变量:Figma 下 `jsd_set_instance_properties` / `figma_component_properties_set` 的 value 支持 `{type:'VARIABLE_ALIAS', id}`;MG / jsDesign 的 `setProperties` 签名不收别名,按 `dicts/platform-value-domain.ts` 第四类表点名拒绝(不写半批)。
- 变量类型面放到引擎全表:`figma_variables_create` / `figma_variables_list` 的 `type` 从 4 种补齐为 `VariableResolvedDataType` 的 6 种(多 `EASING` / `TIMING`),建变量时 `value` 可传 `{type:'VARIABLE_ALIAS', id}` 让一个变量引用另一个(值形态,不是新类型)。
- 新工具 `jsd_create_style`:从**既有节点**建一条本地样式(PAINT / TEXT / EFFECT / GRID),回 id;三类平台的原生形状不同(Figma / jsDesign 无参工厂 + 灌值、MG `createFillStyle({name, id})` 由引擎从图层抄),契约只留一条 `host.createStyle(init)`。PAINT 取值 fills 优先、无填充时退到 strokes,两者都无 / 文本混值(mixed)都当场报错,不建空样式。建完用 `fillStyleId` / `strokeStyleId` / `textStyleId` / `effectStyleId` 绑 —— 这是没有变量面的即时设计上统一色板的正路(`jsd://styles` 从此不再是只读)。
- 删除面接上,`jsd_create_style` 不再是单向门:新工具 `jsd_delete_style`(按 id 删、逐条给 `removed`/`failed`,契约新增 `DesignHost.removeStyle`,三平台各自实现 —— Figma 必须 `getStyleByIdAsync`,MG/jsDesign 只有同步 `getStyleById`;MG 的 `Style` 联合类型里混进了 `Variable`(无 `remove()`),故按存在性守卫收窄)+ 平台 op `figma_variables_remove`(`Variable.remove()`)与 `mg_variables_remove`(`deleteVariable(id)`,同步且不回报告,故先查存在性再删)。
- 真机复验(Figma,插件已重载两次):一次调用绑三组变量 ✓、渐变节点进 `failed` ✓、表外字段六种点名 ✓、`{{@comp:}}` / `{{@var:}}` 命中与未命中候选清单 ✓、组件属性写 `{type:'VARIABLE_ALIAS', id}` 后改那个 STRING 变量的值实例跟着变 ✓(并补上了此前被 zod strip 掉的 `componentProperties[].boundVariables` 读出口)、异步 `fillStyleId` / 按名应用 ✓。测出的第三个 bug:取值检查跑在引擎工厂之后 → 失败路径留下空样式,已改成**先判再建**(待第三次重载复验)。
- 修掉两处输出层的既有缺陷(即时设计真机 2026-10-14 复现):① 组件内文本节点的 `letterSpacing` 运行时是双层 `{unit, value:{value,unit}}`,此前 `serialize.ts` 用 `as unknown as` 原样透传 → 撞 `outputSchema` → **一条只读查询被判失败**;现按 `unwrapLetterSpacing` 取内层。② `core/response.ts` 在结果过不了 schema 时只回原始 JSON + `isError`,zod 详情没有任何出口(于是 `jsd_batch` 把正常数据当错误文案截断呈现);现在先给「结果未通过本工具的输出校验 —— <路径: 原因>」,原始返回附在后面。
- 名字寻址补一条平台语义:`{{@comp:…}}` 的名字一律照 `assets` 原样写 —— 即时设计会把带 `/` 的组件名拆成「集合 / 成分」,`assets.components[].name` 只剩叶子名。写进 `variable-binding` 配方、`reuseGuideText` 的即时设计行与 `jsd_batch` 描述(zh/en)。
- MG 的 `jsd_delete_style` 守到「是不是样式」这一层:`mg.getStyleById` 连变量都解析得出来、运行时变量对象也有 `remove()`,故按存在性判不够(真机用它删掉过一个变量)。改按 `collectionName` 判(样式有、变量没有),误传变量 id 时点名并指回 `mg_variables_remove`。
- 建样式改成**失败即回滚**:引擎工厂先执行,灌值途中任何异常(如 Figma 加载不了本机没有的字体)都会留下空样式。现在 `fillStyleFromNode` 捕获后 `style.remove()` 再抛,与 `figma_variables_create` 同一口径。
- 两平台 `*_variables_apply` 的 binding 逐组 `.strict()`:拼错的键不再被静默吞掉。
- 明确不做:VARIANT 类型变量在 Figma 与 MG 的变量类型表里都不存在,变体取值切换仍走 `jsd_set_instance_properties` / 集合级 op。变量的 `rename` / `setValueForMode` 与集合的模式增删改名仍未接。

决策见 `docs/design-decisions/7165f370-*.md`。真机待验(三平台各自重载插件 + 重启常驻 daemon)。
