---
"text-to-design-ui": patch
"text-to-design-mcp": patch
---

能力字典改为规格表:每条能力一条记录(带 `kind`),文案键收进表里。删掉两份无人消费的中文 label 表与 `ui/src/i18n/capabilityKeys.ts`,面板能力表少一行(不再展示 `platformOps` 能力位 —— 同回包里的 op 名单已经表达了这件事)。

判定行为不变:`inPlaceVariants` 的策略顺序、字段门控结果与 warnings 文案均未改;`textTruncation` / `maxLines` 的类型判定改走 `dicts/prop-applicability.ts` 的同一张适用性表(行为等价)。

**mcp 侧必须一起发版**:MCP 的 `dist` 会把 shared 的源码打包进去,能力枚举就在里面。线格式枚举(`hostCapabilitySchema`)与取值表**同宽**,明确不作跨版本容忍 —— 退役的 `platformOps` 位在两边都是非法值,**插件与 MCP 要同步升级/重载**(不同步时旧插件发来的 `capabilities` 过不了 `pingResultSchema`,`jsd_ping` 会回 `isError` 且**没有** `structuredContent` —— 症状是整个 ping 工具坏掉,不是少显示一行)。见 0029。
