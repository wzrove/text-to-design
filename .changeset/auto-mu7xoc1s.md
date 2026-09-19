---
"text-to-design-mcp": patch
"text-to-design-ui": patch
---

fix: 「回显成功却没生效」不再静默：创建路径补齐 WriteOutcome 回收 + 修正返回键文案与漂移复核覆盖面

- shared（写后回收，见 `docs/design-decisions/0007`）：
  - 创建路径此前只回收能力门控，`WriteOutcome.readback(ok:false)` 与 `outcome.warnings` 被静默丢弃；现由新增的 `core/props/outcome.ts` 统一搬运/组装，`buildNode` 与 `executeOps` 补齐回收，字段级修法文案收进 `dicts/unapplied-prop.ts`（唯一真源，两条写路径共用）。
  - P34（引擎实测新发现，见 0001 变更历史）：`resize()` 会把 TEXT 的 `textAutoResize` 重置为 `NONE`，而创建路径的尺寸回压跑在文本字段之后 —— 调用方显式声明的 `"HEIGHT"` 被吃掉（实测传 `width:200 + HEIGHT` 回读 `NONE`、`height` 停在 15）。新增 `textStabilizeWriter` 在尺寸之后把声明值再压一遍（与 P19 的 sizingMode 同族）。
  - 新增三类点名，全部**以回读为证**（引擎真按请求落了值就一个字都不报）：`fontName` 回读不一致、TEXT `width/height` 被改写、**未声明 `textAutoResize` 却被置 `NONE`**（宽度生效、文本会换行，但文本框高度不随内容重算，父容器按旧高度算会裁切）；根节点 `x/y` 被 `placement`（缺省 center）覆盖 —— 此前只能靠肉眼发现位置不对。
  - `jsd_list_fonts` 增补 `fonts:[{family,styles}]`：写 `fontName` 时 family 用 `fonts[].family` 原样、style 用同一项的**全名**（如 `SourceHanSansCN-Bold`）—— 实测把 style 写成简称（`"Bold"`）会被引擎**静默忽略**（回读照抄请求值、渲染退回默认字面；用对全名后 Bold 与 Regular 的导出 PNG sha1 不同＝字重确实生效）。此前只回 family 列表，调用方只能猜，且不会报错。
  - `fontName` 的判定**挪到结果装配期**：引擎的规范化只在序列化后的值上可见（同一调用里写入期读到的是原样回显），在写入/结算期判会把合法写法误报成没生效（重载后实测踩到）。判据是两条可证的形态：请求带 `_family` 而结果**仍带** `_family` ⇒ 未解析；结果里的族与请求不同 / style 落成 `@@` 哨兵 ⇒ 整族回退。短名对（`{SourceHanSansCN, Bold}`）与 family 不带 `_family` 的少数族不判 —— **宁可漏报不误报**。告警随之带上 `detail`（本次实测到的形态）。
- 测试门禁（两台既有假失败，本机环境所致，非回归）：
  - `tests/engine-api-compat.test.ts`：`core.autocrlf=true` 下 `//.*$` 剥不掉行尾注释（`.` 不吃 `\r`、`$` 要求串尾），注释里提到的 API 名被当违规；读取时归一化 CRLF。
  - `tests/plugin-prop-dispatch.test.ts`：`new URL(...).pathname` 在 Windows 给 `/D:/...`，拼成 `D:\D:\...` ENOENT；改用 `fileURLToPath`。
- mcp-server：
  - `jsd_manage_nodes` 挂上漂移复核钩子：聚合入口此前没挂，`drift-watch.ts` 里为它写的 op 判断是死代码 —— 走 `jsd_batch` 的 `jsd_manage_nodes{op:"remove"}` 不复核，而固定 op 小工具有复核（0003 的覆盖面缺口）。
  - 修正返回键文案：`group`/`flatten` 返回 `created` **单对象**（`clone`/`outline_stroke` 才是数组），此前 batch/manage 两处都写成 `created[]`，按它写占位符会报「无法解析占位符引用」并掐断整批；README、`server.ts` INSTRUCTIONS 同步。
  - 补三条边界纪律（三处同源：工具描述 + `prompts.ts` 总纲 + `server.ts` INSTRUCTIONS）：占位符只在同一批次内有效（跨批次须硬编码真实 id）、根节点 `x/y` 由 placement 决定、结果 `warnings` 一律读（它点名的都是「回显成功但没生效」）。
- 插件侧需重新构建并重载：本次改了 `shared/`，插件跑旧产物时新 warnings 不会出现。
