---
"text-to-design-ui": minor
"text-to-design-mcp": minor
---

feat: `jsd_get_page` 收窄为「当前页顶层几何 + 设计系统资源清单」(见 0039)

**为什么要动**:`get_page` 自称「轻量摘要」,却按 25s 转发预算顶着读。daemon 日志里同一签名反复出现 —— `r38`(10-08)、`r53`/`r54`(10-09)、`r3`/`r5`(10-10,插件与 daemon 都是当日新产物)全是 `ok=false 耗时=25001xms error=forward_timeout`。同一时段 `ping`/`get_selection`/`find` 都是毫秒级返回,只有它挂死:不是掉线,是这条输出面的成本随页面规模涨、却没有任何边界(字段越多、顶层节点越多,引擎跨边界读越多)。上一次的 `lightTopLevel` 只压了单节点读次数,没解决这个。

**输出改成两段**(`nodes` 字段是 `id/名称/类型/宽高/x/y`;`z` 与 `childCount` 在 0039 之后没有消费方):

- `nodes` —— 当前页顶层节点的几何,不递归。
- `assets` —— 资源清单,四项在**当前产物里恒在**:`summary`(四类计数)、`components`(组件)、`variants`(变体集,**带「维度 → 可选值」**)、`styles`(样式,**全量四类** PAINT/TEXT/EFFECT/GRID,各自带 `type`)、`variables`(变量)。某面在本平台不存在时该项是**空数组**,不报错 —— 三平台能力面不对称是常态,让缺口把整条只读调用打成错误没有收益。`variants[].properties` 在平台读不到该字段时**整个键省略**(不写空对象 —— 空对象会被当成「确实没有维度」)。要看资源细节按 id 走 `jsd_find`。

**这张清单的存在理由是「设计前先复用」**:工具描述、`jsd://page` 资源描述、全局 instructions 与 `design-strategy` 配方(新增第 0 条)四处都写死了同一条纪律 —— 设计类任务第一步读它,命中同名/同用途的组件、变体取值、样式、变量**一律复用,禁止新建重复件**,清单里确实没有才允许新建。变体展开维度取值与样式收全量,都是为了不让调用方因为「看不到」而退回新建;四类各自怎么复用(平台入口名不同)由 `platform-facts.ts` 的 `reuseGuideText` 按平台给,配方只做拼接。

`assets` 整块在 schema 里声明为**可选**,只为产物错位容错:MCP 与插件各自升级,旧插件发不出这个键,而 `structured()` 对过不了 schema 的结果一律判 `isError` + 空结构 —— 写成必填会让「插件旧了」表现为整条调用失败(同 `fonts` 的 `total/offset/truncated` 为什么可选)。约定:键缺席 = 产物错位;键在但数组空 = 本平台没这个面。反方向(旧 MCP + 新插件)天然安全,本批只删字段。

**枚举失败不连坐**:引擎的 `findAll*` 会因文档里**任何一个坏节点**整页抛(实测 Figma:残留一个出错的组件集 → 整页一个节点都查不到)。所以枚举按**页** try/catch:失败页跳过、页名写进 `note` 点名(该页清单可能不全),不让一个坏节点把 `get_page` 又打成错误。`note` 因此由「单一的成本标注」扩成「本次读取的附加说明」通道 —— 全量加载成本与枚举降级各占一句。

**资源清单不新造读路径**:组件与变体集走契约里已有的 `findAllWithCriteria`(引擎原生过滤,一次调用遍历全文档,不是逐节点跨边界读);颜色样式复用 `core.listStyles`;变量走**新增的可选契约成员** `getLocalVariablesAsync`,形制照抄 `getLocalPaintStylesAsync`(契约可选 + 平台缺口/投影登记 + Access 层 `typeof` 探测回退)。两侧各一个投影点:Figma 是 `figma.variables.getLocalVariablesAsync`(同步入口在 dynamic-page 下必抛,故只接异步那条);MasterGo 是命名空间下的 `mg.variables.getVariables()`(契约名字在顶层,故在 `code/mastergo/host.ts` 投影)。**即时设计 typings 全文无 variable 声明,结构上接不了** —— 它的资源清单里变量恒为空数组,不是「还没接」。三条平台缺口/投影登记都在 `sync-guarantee.ts` 里配了成对的编译期断言(登记的必须真不在 typings 里;投影项的来源必须真在子命名空间上)。

`dicts/platform-knowledge.ts`(0032 的变量/组件/变体三域事实表)同步更新 MG 那一格:`variables.read` 从 `null` 改成 `mg.variables.getVariables()`、`readShape: 'array'`,并给 `DomainFact.read` 补一句「也可以是本仓已接的枚举 API」。**MG 的变量能力位 claim 仍关着**、写入口仍不接(建集合/建变量/绑值)——claim 的含义是「这个平台有变量能力面」,会连「能改变量」的预期一起放出去;0033 那两个别名 op 也仍在等写侧。变量面文案(`variableFaceText`)据此把「本仓没接」改成「只接了只读枚举,写入口一个都没接」。

**不动的东西**:`jsd_get_page` 的工具名与 `nodes[].id/x/y` 保持原样 —— 结构变更复核(`drift-watch`)的「当前页顶层」那一层靠它配对节点,改名/删字段会静默打断复核(`drift-hook.test.ts` 已守)。`pages`(各页名与顶层节点数)与 `note`(全量加载成本)保留:两者是页级元数据,成本与节点数无关。

真机待验(需 `pnpm build` + 重载插件):① `jsd_get_page` 耗时回到毫秒级、不再出现 `forward_timeout`;② 即时设计上 `assets` 取到组件/变体集/颜色样式,变量为空数组(该平台无变量面);③ Figma 与 MasterGo 上变量清单非空。
