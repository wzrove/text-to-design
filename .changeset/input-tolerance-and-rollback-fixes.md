---
"text-to-design-shared": patch
"text-to-design-ui": patch
"text-to-design-mcp": patch
---

fix: 入参容错与创建回滚补齐 —— 导出建父目录 / 颜色 0-255 / children icon 预检 / batch 占位符形状互认 / pending 请求取消清定时器

**1) `jsd_export` 的 `savePath` 不再要求目录先存在**。此前直接 `writeFileSync(savePath)`,路径里任何一级目录缺失就抛 `ENOENT: no such file or directory, open ...` —— 报错只点名文件,调用方普遍误以为「导出功能坏了」,而实际是没地方落盘。现在写盘前 `mkdirSync(dirname(savePath), {recursive:true})`。

**2) 颜色通道接受 0-255**。`normalizeColor` 一直支持 0-255 整组 `/255`(任一路 >1 即判为该量纲),但 zod 的 `colorChannels` 上限锁在 1,于是这份容错在入口就被判死:渐变 stop 传 `{r:255,g:0,b:0}` 直接报「颜色通道最大 1(0-255 的色值请先除以 255 归一化)」。同一次调用里,绕过 zod 的载荷(`jsd_batch` 嵌套 children、旧客户端)却能正常归一化 —— 两层口径互相矛盾,严格那层拦掉的正是宽松那层专门支持的写法。上限放开到 255,量纲判定统一交给 `normalizeColor`;顺带修它的混合写法 bug:原先 `a>1` 会把本已 0-1 的 rgb 一起 `/255`(`{r:0.2,g:0.4,b:0.6,a:180}` 会塌成 0.0008),现在 rgb 与 a 各判各的。两份 catalog 的通道文案同步改成「0-1,>1 视为 0-255 自动归一化」。

**3) `children` 里的 `icon` 从静默变空矢量改成创建前报错**。`childNodeSchema` 对子节点是 catchall 放行(见 0034 的 JSON Schema 体积取舍),所以 `{type:"VECTOR", icon:"home"}` 里的 `icon` 被整个丢掉,建出一个空 `vectorPaths` 的 VECTOR —— 回显 `ok=true`,画布上一个 100×100 空层,调用方只能靠导出图才发现。现在递归预检整棵子树,命中就抛错并指向正确路子(`jsd_create_icon` 单独建 + `jsd_manage_nodes(op=reparent)` 移入)。

**预检必须发生在任何节点落地之前**:原先这条拦截放在 `buildNode` 顶部,子节点抛错时父 FRAME 已经 `appendChild` 到画布上了(实测留下一个建了一半的空父层)。同时 `executeOps` 的回滚只删已 push 进 `created` 名单的节点,半途抛错的那个进不了名单 —— 两处一起改成:创建前预检 + 回滚按「页面顶层这次新增了什么」清扫。

**4) `jsd_batch` 占位符对单对象/单元素数组互认**。`created` 是数组还是单对象随工具而异(per-type create 是数组,`jsd_create_icon`/`jsd_group_nodes` 等是单对象),写反就报「无法解析占位符引用」并连带整批中止 —— 而 `[0]` 在只有一个人时根本没有歧义。现在两种无歧义写法互认:单元素数组取 `.字段`(`{{x.created.id}}` ≈ `{{x.created[0].id}}`)、单对象取下标 0(`{{x.created[0]}}` ≈ `{{x.created}}`);多元素数组直接取 `.字段` 仍报错,那才是真歧义。两份 catalog 的 `batch.description` / `manageNodes.description` 同步改了口径。

**5) 请求取消后不再留定时器**。`PendingManager` 的 abort 分支只 `delete` 了 pending 与 detach 了 signal,没 `clearTimeout` —— 已取消的请求仍会到点触发超时回调(对已 reject 的 promise 无害,但计时器与条目一直挂在 event loop 上)。同时把「未匹配响应」的 warn 文案从「可能已超时或来源不明」改成点名「客户端已取消回收」,这条日志此前会把正常的取消误读成协议错乱。

真机待验(需 `pnpm build` + 重载插件 + 重启 daemon):① `savePath` 指向不存在的目录能直接导出成功;② 渐变 stop 传 0-255 与 hex 都能落盘并回读到 0-1 通道值;③ `children` 带 `icon` 时整条调用报错且画布上不留任何半成品层;④ 同一批里 `{{iconStep.created[0].id}}` 能解析到单对象步骤。
