# website 设计 token

真值在 `src/index.css`(`@theme` 与 `@layer components`),本表是索引与约定,改值以 CSS 为准。

## 颜色

| token | 值 | 用途 |
| --- | --- | --- |
| `ink` | `#0a0d12` | 页面底色 |
| `panel` | `#10151c` | 卡片/面板 |
| `raise` | `#161d26` | 面板内凸起(代码块、步骤条) |
| `line` | `#232c38` | 1px 描边、分隔线 |
| `txt` | `#e6ebf2` | 主文本 |
| `mute` | `#8b97a8` | 次级文本、mono-label |
| `brand` | `#8ad654` | 动作色:主按钮、强调、状态点 |
| `coral` | `#f76868` | 仅品牌图形(窗口红点),不承载语义 |
| `code` | `#a8d8ff` | 命令/工具名 |

对比度(ink 底):txt 15.8:1、mute 7.0:1、brand 9.3:1,均过 WCAG AA 正文。
`coral` 与 `code` 只做装饰与代码标识,不用于正文。

## 字体

- 正文 `system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei"`,开 `-webkit-font-smoothing: antialiased`。
- 等宽 `--font-mono`,用于命令、工具名、mono-label。

| 角色 | 字号 / 行高 | 字重 | 字距 |
| --- | --- | --- | --- |
| h1 | 36 / 40(sm 48 / 53) | 600 | -0.025em |
| h2 | 24 / 32(sm 30) | 600 | -0.025em |
| 卡片标题 | 15 | 500 | 常态 |
| 正文 lead | 17 / 1.625 | 400 | 常态 |
| 次级正文 | 14–15 / 1.625 | 400 | 常态 |
| mono-label | 12 | 400 | +0.18em,大写 |

## 间距 / 形状

- 区块纵向:`py-14`(移动)/ `sm:py-20` / `lg:py-28`;区块间 `border-t border-line/70`。
- 双栏栅格:`gap-10` / `sm:gap-14`,桌面 `lg:grid-cols-[1.05fr_1fr]`。
- 内容容器:`max-w-6xl`,横向 `px-5 sm:px-8`。
- 卡片内边距 20(`p-5`),小面板 16(`p-4`)。
- 圆角:卡片 `rounded-xl`(12),面板 `rounded-lg`(8),按钮 `rounded-md`(6),chip 全圆。
- 阴影只在 Hero 演示卡用一档:`0 0 0 1px rgba(255,255,255,.02), 0 24px 60px -24px rgba(0,0,0,.8)`。其余层级靠 `line` 描边区分,不堆阴影。

## 动效

- 缓动统一 `--ease-soft: cubic-bezier(.22,1,.36,1)`(末端减速),新动画不许自带 cubic-bezier 字面量。
- 时长:滚动显现 700ms;卡片作画 `paint` 620ms、`block-in` 460ms、`grow-x` 420ms;展开/淡入 260ms;悬停过渡 300ms。
- 错峰:同组列表 `revealDelay(i, 70)`,写 `--reveal-delay`。
- 画布作画不参与上面这套:它走 **GSAP 时间线**,顺序由 `.fromTo()` 在时间轴上的插入位置决定,stagger 用 GSAP 的 `stagger`,不再用 CSS 延迟变量。原因是一段有严格先后依赖的序列,用 CSS 延迟拼不可控(改一处要重算全部时间点)。
- gsap 走**按需异步加载**(`import('gsap')`,卡片进入视口前就预取),主包不含它:主 JS ~17 kB gzip + gsap 分块 ~27 kB。
- 环境动画只两处且都无限循环:背景网格 `grid-pan 28s`、光斑 `drift 16s`。卡片本体不浮动、不位移,动效只发生在内容内部。
- `prefers-reduced-motion: reduce` 下全部动画压到 0.01ms、循环次数 1,`data-reveal` 直接落在终态。

## 组件状态

| 组件 | 默认 | 悬停 | 聚焦 | 禁用/不可用 |
| --- | --- | --- | --- | --- |
| 主按钮 | `bg-brand text-ink` | `-translate-y-0.5` + `brightness-110` | 全局 focus ring | 不用禁用态,缺产物时改文案 |
| 次按钮 / ghost | `border-line bg-panel` | `-translate-y-0.5` + `border-brand/50` | 同上 | 同上 |
| chip(平台) | `border-line bg-panel` | `border-brand/40`,不改背景 | 同上 | — |
| 卡片 | `border-line bg-panel` | `border-brand/40` 或 `bg-raise` | 卡片不可聚焦时靠内部按钮承载 | — |
| 链接 | `text-mute` | `text-txt` | 同上 | — |
| 复制按钮 | `border-line bg-raise` | `border-brand/50 text-txt` | 同上 | 复制失败静默回落,不弹错 |

聚焦统一走 `:focus-visible { outline: 2px solid brand; outline-offset: 3px }`,任何组件不得重置 outline。

## 无障碍

- 演示卡:完整提示词进 `sr-only`,逐字层与画布区 `aria-hidden`;画布是装饰,不进读屏。
- 装饰性图形(背景网格、光斑、进度条、分隔点)一律 `aria-hidden`。
- 外链全部 `target="_blank" rel="noreferrer"`。
- 页面无颜色-only 语义:状态靠文案(「已连接」)+ 形状同时表达。

## Hero 演示时序

`typing`(逐字 38ms,每 6 字停 110ms)→ `thinking`(转圈 + 三点跳 620ms)→ `tool`(绿色对勾 + 工具回执滑入,停 760ms)→ `draw`(画布逐块落位,见 `--d`;最后一帧 1760ms 出现蚂蚁线选中框与 `300 × 200` 尺寸标签)→ 停 1600ms。
四段状态由 `phase` 单一信号驱动,CSS 只负责每段内部的过渡。
**只播一遍,播完停在终态**,不再自动循环(此前靠悬停续播,实测是干扰:鼠标停在卡片上就无限重放)。
重播入口只有底部「重播演示」按钮;`play()` 靠 `runId` 版本号作废旧时序,连点也不会出现两条时间线。

两条踩过的坑,改时间线时必须遵守:

1. **GSAP 只写它声明过的属性。** CSS 兜底把 `.demo-canvas .draw-item` 压在 `opacity: 0`,底盘(靠 `clip-path` 揭示)和骨架线(靠 `scaleX` 揭示)的 tween 里若不带 `opacity`,它们就永远不显形——而父级不显形会连带整棵子树看不见。
2. **gsap 是异步分块,演示时序不能等它。** 打字阶段不 await 它;分块加载失败走 `.demo-canvas.is-drawn` 直接落终态,画布不留空白。
