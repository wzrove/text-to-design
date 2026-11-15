# e06dbd23. 节点解析选路按平台声明：补完 e1e66f0a 遗留的 getNodeByIdAsync 半项

- **日期：** 2026-11-15
- **状态：** 已采纳
- **影响范围：** shared/core/access.ts(resolveOne / resolveNodes / resolveNodesMap)、shared/core 全部按 ids 解析节点的调用方(nodes / update / component / export / styles)、ui/src/code/plugin.ts 调用点、三平台 meta.ts 能力声明
- **相关记录：** dec e1e66f0a(选路判据族)、dec 0010(异步优先被推翻的第一案)、dec 0039 / 0043(同族 documentScopeRead / styleEnumerationSync)

## 压力

e1e66f0a(2026-10-19)把「两条入口、走哪条」的判据从运行时探测改成平台声明,修掉了
styleEnumerationSync 与 mainComponentSync 两处,但**明确留下 resolveOne 的
getNodeByIdAsync 半项不做**,理由是「即时设计上 find 一直是毫秒级,没有它挂的证据」。

2026-11-10 与 2026-11-15,证据落地(daemon 日志,%TEMP%/text-to-design-mcp.log):

- 2026-11-10T17:23~17:32:set_stroke **17 连** 25s forward_timeout;
- 2026-11-15T14:49~14:55:find 5 次 25s forward_timeout(r5/r6/r18/r22/r33);
- 同一会话里 ping 恒 4~12ms、get_page 1.4s、非 ids 的 find 1~3s ——
  挂死只打击「按 ids 解析节点」的工具,且**失败后同方法重试立即恢复**。

这正是该判据族的标准指纹:typings 未声明的 getNodeByIdAsync 被宿主
Object.create(native) 透出,typeof === 'function' 恒成立,await 永不
settle —— 挂的是 Promise,线程不冻、catch 不到,UI 侧 25s 转发定时器先放弃。
set_stroke 与 find 的唯一共同前置就是 resolveOne 的这次 await。

## 候选与排除

| 候选 | 结论 | 排除理由 |
|---|---|---|
| 新增 flow 能力位 nodeResolveSync,resolveOne 按声明选路 | 采用 | 与 e1e66f0a 两个先例完全同形:判据在调用前、平台声明是唯一真源 |
| 给 async 分支加 race 超时 | 排除 | e1e66f0a 候选表已排除过:超时只是放弃这次调用,幽灵 await 仍占着 pending;且每次解析都白付预算 |
| 全平台一律只走同步入口 | 排除 | Figma dynamic-page 下同步入口必抛,必须走 getNodeByIdAsync(0011 的前提) |
| 保持简单(只修 find/set_stroke 两入口) | 排除 | 挂点在 resolveOne 一处,但按 ids 解析的工具面很宽(component / export / reparent / group / clone / styles…)。只堵两处,其余工具在 jsDesign 真机上继续随机挂 25s |

## 结论

不引新模式:新增 flow 位 nodeResolveSync,选路由平台声明决定 —— e1e66f0a
判据族的第三例。即时设计声明(只问同步 getNodeById);Figma / MasterGo 不声明
(行为不变:前者必须走 async,后者本就无该符号、探测落空)。

## 实施方案

- **目标形状**
  - 能力位:dicts/capability.ts 登记 nodeResolveSync(flow),label 两语言各一;
  - 单点选路:core/access.ts 的 resolveOne 收 RuntimeContext(可选参,
    兼容旧调用方),preferSync 判一次;resolveNodes / resolveNodesMap 透传;
  - ctx 串线:所有「按 ids 解析」的 core 调用方(nodes / update / component /
    export / styles)在 resolve 调用点补传 ctx;签名原本无 ctx 的结构操作
    (setSelection / removeNodes / cloneNodes / groupNodes / flattenNodes /
    outlineStrokeNodes / reparentNodes / exportNodes / fillImageNode /
    createInstances / swapComponents)加 ctx: RuntimeContext 必参,plugin.ts
    调用点同步更新;
  - 扩展点:将来再有「两条入口」的面,加一位 + 选路处一行(沿 e1e66f0a)。
- **本次不做**：① MG 声明这一位(运行时无该符号,探测本就落空,声明等于把未验证
  事实写进声明表 —— 与 e1e66f0a 对 MG 的处理一致);② mcp-server 侧任何改动
  (它不 import core,全走 bridge method);③ 遥测侧对 forward_timeout 加新分类
  (fingerprint 已按 subject 区分,find / set_stroke 各自可查)。

## 成本与退出条件

- 成本：一个能力位 + 11 个函数签名各加一参 + 若干调用点补传;无新增间接层、无新状态。
- 退出条件：① jsDesign 官方 typings 收录 getNodeByIdAsync 且真实可用 ⇒
  JsDesignAsyncGap 反向断言先红,届时删 jsDesign 的这一位声明 + sync-guarantee
  登记即可,core 选路不动;② 若 jsDesign 的同步入口将来也开始挂 ⇒ 摘掉声明那一行,
  该平台解析退回恒探测(fail-closed 的预期行为);③ ctx 可选参若造成调用方漏传的
  隐蔽 fail-open,typecheck 抓不到 —— 靠 node-resolve-sync.test.ts 第 5 例钉住
  缺省语义,漏传即测试红。

## 验证

- 不变量测试:__tests__/node-resolve-sync.test.ts 5 例 —— 声明 ⇒ getNodeByIdAsync
  一次都不碰(resolveOne 与 resolveNodes 批量两条各一例);未声明(Figma 形状)⇒
  仍走 async;未注入 ⇒ fail-open;ctx 缺省 ⇒ fail-open。断言**调了哪条入口**
  (called 记录),不是返回值 —— 只看返回值放过「先 await 再回退」,那照样挂 25s。
- 真机门禁:jsd_ping 的 capabilities 必须出现 nodeResolveSync 才算插件重载
  成功(否则后面测的全是旧产物)。
- 边界:dynamic-page(Figma)语义不动 —— 未声明平台照走 async,由第 3 例守。
- 指标与日志:daemon 日志里 jsDesign 的 find / set_stroke 不再出现
  error=forward_timeout;既有 telemetry fingerprint(subject=find / set_stroke)
  停止增长。

## 变更历史

| 日期 | 需求变更 | 结论变化 |
|---|---|---|
| 2026-11-15 | 初次决策。起因:2026-11-10 set_stroke 17 连 25s 超时 + 2026-11-15 find 5 次 25s 超时(daemon 日志),同会话 ping 恒毫秒级 ⇒ e1e66f0a 当年「没有它挂的证据」不再成立 | 不引模式:新增 flow 位 nodeResolveSync,resolveOne/resolveNodes/resolveNodesMap 按声明选路;按 ids 解析的全部 core 调用方串 ctx;即时设计声明这一位。e1e66f0a 的「本批不做」清单至此全部清账 |
