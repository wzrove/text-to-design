---
"text-to-design-ui": minor
"text-to-design-mcp": patch
---

feat(mg): MasterGo 变量读写接入 platformOps(见 0040)

此前 MG 的变量面是半截的:0039 只接了只读枚举(`jsd_get_page` 的 `assets.variables` 能列出变量),但没有任何写入口 —— 而变量的价值全在「建出来、绑到图层、画布跟着变」。现在补齐三个 op,走既有的 `jsd_platform_op` 通道(不新增工具,目录体积不受影响):

- `mg_list_variables` —— 摸底 / 回读:集合(含模式)+ 变量(类型 / 所属集合 / 描述 / 各模式的值)。
- `mg_variables_create` —— 批量建变量。**参数形状刻意对齐 Figma 的 `figma_variables_create`**,两个平台共用一套调用纪律;同名集合复用、同名同类型变量就地更新值,失败回滚**本次新建**的集合(复用既有集合时不删,避免连坐删掉用户变量)。初值:单值类型直接给(BOOLEAN/NUMBER/STRING/COLOR,COLOR 用 `{r,g,b,a}` 0-1 浮点),复合样式类型走部分更新语义。
- `mg_variables_apply` —— 绑定 / 解绑变量到图层属性(`unbind: true` 解绑)。

**槽位取值以官方文档为唯一依据**:`mg.variables` 这片 API 在 typings 里只有签名、没有一个字的说明,`setVariableReferenceInLayer({strokeProperty: 'all'})` 这类槽位的取值全是裸 `string` —— 照类型猜会写出不存在的槽位而静默不生效。故按官方文档的「属性参数一览」逐值落表(`baseProperty` / `strokeProperty` / `radiusProperty` / `paddingProperty` / `dimensionProperty` / `effectProperty` / `gridProperty` / `textProperty`),并在入参校验就点名(传错立刻报可选项清单,不落到引擎)。文档与 typings 的两处不一致已就地注明:文档的变量类型表少一个 `SPACING`、`setVariableValue` 的 `modeId` 文档可选而 typings 必填(本仓按 typings 走,并加了双向同宽断言)。

**回读纪律**:`create` 回读变量是否都在(缺一个就抛 —— 本平台有「回包成功、值没变」的前科);`apply` 回读 `getLayerVariableModes`,拿不到变量所属集合时在结果里点名 `unverified` + `warning`。⚠ MG **没有**「图层属性 ↔ 变量」的反读接口,所以绑数组属性(fills / effects / grids)必须自己给 `index`,视觉结论要 `jsd_export` 目视 —— 这条写进了 op 描述与配方。

**顺带修掉一个会喂错模型的坑**:`variable-binding` 配方的「批量绑定」那段此前硬写着 Figma 的字段词汇(`nodeIds` + `boundProperty` + `variableId`)。MG 一旦有了写入口,按「有写入口」拼接的同一段文案就会落到 MG 调用方身上 —— 参数名全错且不报错,只会静默绑不上。现在把三段平台句子挪进 `platform-facts.ts`(平台差异只落声明表与投影点),配方只做拼接;`variableFaceText` 的装配期那半句也改成按表逐平台派生(原来硬写 Figma 的读路径)。

`platform-knowledge.ts` 的 MG `variables` 随之更新:`write` = 两个新 op,`nativeUnwired` 缩到旁支(模式管理 / 分组管理 / 变量引用变量 / 作用域与代码语法 / 复合变量补子项 / 一步建绑);`meta.ts` 声明 `variables` 能力位(此前不 claim 正是因为只有 typings 没有接线);MG 的 `platformOps` 11 → 14。

真机待验(MasterGo 客户端):① 建四种单值变量并回读值;② 建复合样式变量;③ `strokeProperty:'all'` 等槽位各绑一次确认画布真的变;④ `unbind` 能解开;⑤ 传错槽位时错误里出现可选项清单。
