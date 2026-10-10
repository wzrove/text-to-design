---
"text-to-design-ui": patch
---

fix(figma): 变量面补上「清单」与「解绑」,与 MG 对齐(见 0040)

对账 MG 的 14 个 op 时发现 Figma 的变量面缺两块 —— 不是漏写,是当初只按「建 + 绑」最小闭环做的:

- **`figma_variables_list`**(新):列出变量集合(含模式)与变量(类型 / 所属集合 / 描述 / 各模式的值),与 MG 的 `mg_list_variables` **同形**。此前 Figma 的变量读路径只有节点上的 `boundVariables` —— 读到的是**绑定**,不是**库存**;「有哪些变量、值是多少、有哪些模式」在画布上根本没有出口,选变量绑定前只能猜 id。与 `jsd_get_page` 的 `assets.variables` 不是两件事:那条是不分平台的概览(只有 id + 名称)。
- **`figma_variables_apply` 支持 `unbind: true`**(解绑):两个入口都收 `null`(`setBoundVariable(prop, null)` / `setBoundVariableForPaint(paint, 'color', null)`),语义是「把该字段上绑着的东西摘掉」,此前只能绑不能解。

顺带修掉一个两个平台共有的形状问题:`variableId` 改成**可选**。解绑根本不需要变量(Figma 的入口收 `null`、MG 的 `unlinkVariableReferenceInLayer` 不收 id),而此前两边的 schema 都把它写成必填 —— 那会让「解绑」这个动作凭白要求一个用不上的 id。绑定方向改由入参校验守:没给 `variableId` 且不是解绑时报「绑定时必须给 variableId(解绑才不用给)」。

`platform-knowledge.ts` 的 Figma `variables` 随之补上读出口与 `nativeUnwired`(`Variable.setValueForMode/rename/remove`、集合的模式增删改名 —— 平台有 API、本仓未接);`figma_variables_list` 也进了配方第 2 节(`variableBindShapeText('figma')`),与 MG 的对应句子对称。

真机待验(Figma,`pnpm build` + 重载插件):① 清单能列出集合/模式/值;② 绑一个 paint 类字段后 `unbind` 能解开(回读 `boundVariables` 里该键消失);③ 不给 `variableId` 调绑定时报「绑定时必须给 variableId」。
