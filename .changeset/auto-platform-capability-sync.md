---
"text-to-design-mcp": minor
"text-to-design-ui": minor
---

feat: 平台能力表全面打通(字典真源 → core 判定 → MCP → 面板)

- shared: 新增 `dicts/capability.ts` 作为能力唯一真源(取值 + 中文标签 + 能力门控的属性表),`dicts/node-type.ts` 增加读路径全表(`OBSERVED_NODE_TYPES`,含 Figma 独有的 20 类只读类型);capabilities 与 node type 的 zod 枚举改为从字典派生。core 的「字段是否生效」判定不再手写 `PLATFORM_SUPERSET_PROPS`,而是吃注入的能力表(优先级:能力表否决 → 运行时属性探测),创建路径同样点名跳过的门控字段。
- mcp-server: daemon 新增平台状态缓存(插件上线自动探测、断开清空、失败 fail-open),`jsd_ping` 增加 `platformOps` 名单回传;新增只读资源 `jsd://platform/state`;工具支持 `platforms`/`platformNote` 声明,平台不适用时直接拦截并给出替代路径(`jsd_platform_op` 标注为仅 Figma)。
- ui: 面板新增可折叠「能力」区块(核心能力 / 平台差异能力 / 平台特有 op 名单),数据经既有 ping 通路获取;两平台编译期契约断言补全(NodeSkeleton 成员存在性、Figma 独有类型登记、jsDesign 超集缺席)。
- 修复: 读路径遇到 Figma 独有节点类型(如 SECTION)会让 `jsd_get_selection` / `jsd_get_page` 整条结果校验失败;`ungroup` 在 Figma 上因调用不存在的节点级方法而静默 no-op。
- 文档: 修正 README 中「只读资源随连接门控隐藏」的过时描述(实际是目录恒定、离线调用快速失败)。
