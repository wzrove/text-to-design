# text-to-design MCP BUG记录（已冻结）

> **本文件已冻结，只读。** 两个技能合并为 `.agents/skills/mcp-tdd` 之后，报错记账的
> **唯一通道**是 `docs/mcp-errors/` 台账（CLI：`node .agents/skills/mcp-tdd/scripts/mcp-tdd.mjs`，
> 指纹去重 + 回归证据链）。本文件保留 P1–P32 的历史根因与修法，**不再新增条目**。
> 其中「不修但已兜住」的平台限制（P7）已并入 `../references/platform-limits.md` 表，
> 后续同类现象查那张表；历史遗留的未闭环点见 `../references/bookkeeping.md`。
> 维护口径：`../references/bookkeeping.md`。

> 边用边记。**已修复条目验证通过后即移入文末「已修复归档」，只保留待修项在主体**，
> 避免文档膨胀。代码位置：`/home/zzz/workplace/js-app/packages`

## 架构认知（重要）

**工具的实际执行发生在插件进程内，不是 daemon 进程。**

- `groupNodes` / `reparentNodes` 等核心逻辑位于 `packages/shared/src/core/`，
  但由 `packages/ui/src/code/plugin.ts` 分发，在**即时设计客户端内的插件进程**执行。
- daemon（`mcp-server`）只负责：接收 MCP 调用 → 经 WS 转发给插件 → 回传结果。
- 因此**改了 `shared` / `ui` 代码后，必须重新构建 + 在即时设计里重载插件**；
  仅重启 daemon 无效（插件仍跑旧代码，报错照旧）。

**重载步骤**：`pnpm build` → 在即时设计「插件 → 开发 → 重新运行」加载
`packages/ui/dist/jsdesign/manifest.json`。

**排查陷阱**：
- 不要据**实例侧**序列化的空 `fills` 判定样式缺陷 —— 实例 override 可能未落盘，
  应先查主组件（见 P7）。
- **改了 `ui/` 后必须重载插件才算数**。若报错与修复前完全一致、一字不差，
  优先怀疑「插件还在跑旧产物」，而不是「修错了」。
- **一个 bug 可能横跨两处调用链**：如 P6 需同时修 `shared`（算法兜底）与
  `ui/plugin.ts`（参数透传）才生效，只修一侧现象不变。

**排查提示**：报错里的函数名（如 `set_x` / `get_layoutGrow`）来自即时设计运行时
内部 API，不在本项目源码中，搜不到是正常的；应去 `shared/src/core/` 与
`ui/src/code/plugin.ts` 找对应调用点。

---

## 待修 / 待确认

### P7 — 平台缺陷：INSTANCE 子节点改 `fills` / `fontName` 静默失效

- **现象**：对 `Instance:<实例id>;<原id>` 形态的实例子节点调用 `jsd_set_fill_color`
  或 `jsd_set_text({fontName})`，返回回显为新值，但画布与导出渲染仍是组件原样式。
- **证据**：两工具描述均写明「已知平台缺陷（实测）…引擎静默丢弃；
  需要实例级差异时用静态节点重建」。排查中实例侧读不到 `角标数` 的 fills，
  而主组件 `71:230` 的 `71:221` 明确有白色 fills，说明实例 override 未真正落盘。
- **根因**：引擎不支持实例子节点的样式 override 持久化（文字内容 `characters` 正常）。
- **规避**：样式类修改一律改**主组件**，让实例继承；确需单实例差异则重建为静态节点。
- **状态**：平台限制，不修（渲染层改不了）。**检测与出口都已补齐**：写样式类字段到
  INSTANCE 内的子节点时，结果带 `warnings` 点名节点与字段（`shared/src/core/update.ts`；
  覆盖任意节点 + 全部样式字段，几何/命名类字段不误报），**并直接算出主组件里对应
  子节点的 id**（`instanceStyleFixHint()`，按名字路径在主组件树里定位），调用方拿到即可
  改主组件；各样式类工具描述尾部统一挂 `INSTANCE_STYLE_WARN`。
- **为什么它一直留在主体**：它是**唯一仍在的平台缺陷**，归档区放的是「已修复」条目，
  这条是「不修但已兜住」，留在主体作为已知限制的常驻提醒。

---

## 本轮（连接恢复后）新增

> `commit bae5a4b` 后的引擎侧实测：**P22 / P26 / P27 / P28 / P29 已闭环**，归档见
> `text-to-design-mcp-已修复归档.md`（P22/P26/P28/P29 加实测行，P27 新增条目）。
> **P30** 已闭环（v3 含 `serializeNode` 探活，最终以用户重载插件后实测富出口文案到位），
> 归档同 P24 一档。「**P25-B 真漂移检出**」仍未构造出复现样本。

---

## 已修复归档

已移至独立文件 **`text-to-design-mcp-已修复归档.md`**（内含根因、代码落点、
验证方式与「是否需要重载插件」）。当前归档覆盖：

- **P1 ~ P6 / P8 ~ P11 / P13 / P18 ~ P21**：早期批次（daemon 探活、二进制帧校验、
  静默 catch、编组 NaN、reparent 深层坐标、create_frame 尺寸与 padding、
  LINE 零维、纯描边灰底、同父级调层序、`jsd_ping` 能力上报、写类工具「未知方法」等）。
- **P22 / P23 / P26 / P27 / P28 / P29 / P30（本轮）**：batch 回显裁剪与超预算降级、
  `jsd_manage_nodes` 回显键统一、`recursive` 不再改目标节点自身 + `includeSelf` +
  warnings、冒烟 `jsd_find` 误报 `isError`（实为 stub 形状缺陷）、`recursive` 跳过
  自身时回显不再误报「失效/未传属性」、`combine_as_variants` 富出口文案到位。
  **全 7 条已引擎侧实测通过**；P26 的修复带出 P28 / P29（已闭环）；
  P30 通过 v3 `serializeNode(s)` 探活捕获引擎 getter 异步抛、归档。
- **P25**：reparent 坐标口径 + 批次几何漂移自动复核。开关路径
  （`checkDrift:false` 不做读数）已实测；「真出现漂移时能被检出」未构造出复现
  样本，原状保留为唯一未闭环的引擎验证点。

流程、排查方法与验证步骤见项目根目录 **`AGENTS.md`**。
