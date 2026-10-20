---
"text-to-design-ui": patch
"text-to-design-mcp": patch
---

fix(jsdesign): 组件 / 变体 / 实例按**实际运行期类型**收口,不再按 typings 假设。真机 2026-10-20 逐条隔离出的四处「声明了但运行期不是那样」:

1. **变体表取值形状** —— `variantGroupProperties.values` 元素不保证是字符串(多成员集合回 `[{name:"默认"}]`),撞穿线格式 `string[]` 会让 `get_page` / `jsd_find` **整条失败**。归一收进新模块 `core/variant.ts`,两个投影点(`serialize.ts` / `assets.ts`)与平台 op 共用一份实现;`serializeNode` 另加「getter 抛也省略该字段」保护。
2. **两套变体键** —— 集合维度键(如 `状态`)与成员键(`分类1`)**不是同一套**,而引擎写入口只认成员键。`setInstanceProperties` 现在两边都收,集合键按**取值唯一匹配**映射成成员键(歧义/无匹配点名报错,绝不猜),并把键解析提到任何写入之前。
3. **实例三通道运行期不可用** —— `setProperties` 不是函数、`swapComponent` 抛内部错误、`detachInstance` 原位返回 INSTANCE(静默 no-op)。三条通道改为**行为检测 + 写后回读**,失败逐条点名并给可执行出口;`createInstances` / `cloneNodes` 对**组件集成员**的引擎缺陷(createInstance 必抛、clone 返回 undefined)逐条收集而非整批崩。
4. **事实与文案** —— `platform-knowledge.ts` 回填真机证据并**把 `jsd_set_instance_properties` 从 jsDesign 的 variants.write 里摘掉**(那条路径实测必败);`platform-facts.ts` 的三处投影改为取事实表判据,不再声称「切到已有取值」。`jsd_component_facts` 增补 `swapComponentAvailable`、`dimensionMismatch` 细分为 setOnly/memberOnly。
