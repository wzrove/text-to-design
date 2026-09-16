---
"text-to-design-ui": patch
---

fix: 「连接中」不再牵动面板结构,未连接时提示条不重载

- ui(StatusBadge): 「连接中」的反馈收拢成徽章上的一个转圈(`.badge-spin`,900ms linear,`prefers-reduced-motion` 下由全局规则压为静态)。它只是进行时,不是另一种面板形态,因此其余区块不再为它改结构。徽章文字与颜色仍如实跟随 status,不做时间维度修饰。
- ui(ConnectionHint): 形态空间从四态收成三态(connected / superseded / disconnected),`connecting` 并入「还没连上」共用引导卡 —— 连接期间「后台服务尚未连接」依然是事实,卡上两条路径也依然可执行。同时形态切换改为只切显隐、不重建 DOM:此前 `createMemo` 按 status 分支返回新 JSX,Solid 每次都把整块提示条卸载重建(`hint-enter` 重播、按钮焦点与「已复制」反馈丢失、live region 重播播报),表现为「组件在重载」。播报改用常驻 sr-only live region,按真实 status 播报(含 connecting),文案压到一行。
- ui(ConnectionHint): 顺带删掉与页头重复的信息 —— 原「连接中」那行复述的端口(`ws://localhost:<port>`)与「点右上角重试」,页头已常驻 `:<port>` 与「重试」按钮。
