---
"text-to-design-mcp": patch
"text-to-design-ui": patch
---

fix(core): 节点解析改按平台声明选路,修即时设计周期性挂死

resolveOne 不再用 typeof 探测 getNodeByIdAsync:即时设计 host 是 Object.create(native),
该成员运行时存在但永不 settle,await 撞满 25s 转发上限且 catch 不到 —— 凡按 ids 解析
节点的工具周期性挂死。新增 flow 能力位 nodeResolveSync(即时设计声明,Figma / MasterGo
不声明),resolveNodes / resolveNodesMap 透传 ctx,所有调用点补齐;ctx 未注入时退回
typeof 探测(fail-open)。shared 为 private 包,其源码 bundle 进两个包的 dist,故两包同出。
