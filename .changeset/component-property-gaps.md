---
"text-to-design-ui": patch
"text-to-design-mcp": patch
---

fix: 组件属性两处静默缺口 —— 写侧键归一回 core，读侧暴露图层引用（见 0041）

两处都在「组件属性」这条读写链上，由用 Figma 真机搭一个通讯录页（复用「会话行」组件铺 3 行联系人）的同一批操作暴露。

**① 写侧：键形态从没归属，文档却承诺已归一。**

`jsd_set_instance_properties` 把键原样透传给引擎，中间零归一。而引擎对**组件属性**（BOOLEAN / TEXT / INSTANCE_SWAP）只认带 `#` 后缀的完整键 —— 真机四连测，短名一律 `in setProperties: Could not find a component property with name: '标题'`（TEXT / BOOLEAN / INSTANCE_SWAP 三类都一样）。免后缀只对**变体属性**成立，那是另一张表。

三处文档（输入 schema 的 describe、`component-property` 配方 §4、工具描述）长期写着「门面会自动归一，传名字即可」，实现里只有 MasterGo 门面做了，且那里自承只兜得住 BOOLEAN/TEXT。现在在 `core/component.ts` 补齐三个平台，四条纪律：精确命中保留 → 基名**唯一**命中补成完整键 → 命中 0 个原样透传（变体属性不在 `componentProperties` 里、MG 的实例属性表实测常为空，按「查不到就拒」会把这两类合法调用一起打死）→ 命中 ≥2 个报错并列出候选。

歧义在**任何一次写入之前**报出来（先把每个实例要写的键算完再统一下笔），不留下半批覆盖。三处文档同步改成「变体属性传名字，组件属性传完整键，core 只在基名唯一时补全」。

**② 读侧：看不见「哪个属性驱动哪个图层」，于是同一件事能做错而不自知。**

`会话行` 的 12 个属性成对存在（`摘要`/`摘要2`、`显示铃铛`/`显示铃铛2`…），只有一组连着可见图层。改错那组时 `componentProperties` **全部回读为新值**、回包 `ok=true`，画布上摘要/时间/铃铛纹丝不动 —— 纯静默失效，且没有任何信号提示哪一组是活的。

引擎有一手事实（Figma `plugin-api.d.ts:6545`、MG `dist/index.d.ts:2406` 的 `componentPropertyReferences`），仓库此前只用在写侧绑定，没进读路径。现在加进序列化：`NodeSkeleton` 与线格式各加一个**可选**字段（无引用或平台不支持时整个键缺席，「键在 = 至少有一条引用」可直接依赖），槽位键**归一到一套词汇** `visible` / `characters` / `mainComponent` —— MG 原生的显隐槽叫 `isVisible`，原样透传等于把 0025 刚决定藏起来的两套词汇重新暴露到读路径。`jsd_find` 读组件子层即可看到 `R_摘要 → { characters: "摘要2#32:7" }`，据此一次选对属性。

jsDesign 的 `plugin-api.d.ts` 全文零命中该声明（属**接不了**，与「未接」不是一回事），已登记进 `jsdesign/sync-guarantee.ts` 的缺席清单，由编译期断言守。

**顺带修掉一个会喂错模型的坑**：`component-property` 配方 §6「复核」只教了「回读 `componentProperties` 比对」，而这恰好是上面那个静默失效骗得过的判据。现在补一条：回读通过 ≠ 画面变了，写完要 **jsd_find 深度读节点的实际内容 / 可见性**复核，选键阶段先读 `componentPropertyReferences`。

新增 9 例单测（`component-property-keys.test.ts`）：精确键不改写 / 基名唯一命中补全 / 多头命中报错列候选 / 未知键透传 / 混合三类键 / 布尔值形态不变、读路径槽位归一 / 无引用时键缺席 / 回包能过线格式校验。

真机待验（Figma）：① 用短名 `头像` 调 `jsd_set_instance_properties` 应命中 `头像#32:6`；② `jsd_find` 读「会话行」组件子层应能看到 `componentPropertyReferences`；③ MasterGo 侧同一字段应输出 `visible`（不是 `isVisible`）。
