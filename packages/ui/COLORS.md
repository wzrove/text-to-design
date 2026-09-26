# UI 配色体系(text-to-design 插件)

> 唯一事实来源:`packages/ui/src/index.css`(daisyUI 5 主题块 + `@theme` + `:root`)。
> 本文档是使用说明书。
> 依据:ui-ux-pro-max 指南(对比度 ≥4.5:1、禁纯色传义、淡底组合规范)

## 〇、统一架构(单一颜色入口)

```text
src/index.css —— 全部颜色只在这里声明,分两条通道:

① @plugin "daisyui/theme"  ×2 套(textdesign / textdesign_dark)
   语义色 primary/secondary/accent/neutral/base-*/*-content/info/success/warning/error
     → #hex 原值(设计稿口径)
   透明度一律用 Tailwind 原生修饰符 bg-X/N,无需预置槽

② @theme(Tailwind 4 color 命名空间,纯 hex 槽)
   dot-* 节点类型分类色板 14 项 → #hex 原样,自动生成 bg-dot-* 工具类

   另有 :root 只放一个真 CSS 场景:scrollbar-thumb(工具类表达不了)

        ↓ 组件消费(全部走 Tailwind 原生类,不再有 var(--component-*) 内联写法)
TSX 组件:bg-error/10 + border-error/25 + text-error、bg-dot-frame …
```

**已删除**:`tailwind.config.js`(v5 CSS-first)、`src/styles/tokens.css`、
`design-tokens.json`(颜色已全量迁入 `src/index.css`)、全部
`--primitive-*` / `--component-*` 变量,以及一度引入的 `chip-*` / `hint-*` /
`log-error-tint` rgba 扩展槽(理由见下「透明度写法」)。

设计原则:
- **所有颜色单一入口** → `src/index.css`。改色只改这一个文件,组件零改动。
- **默认即原值** → hex 槽写 `#hex`,构建不做转换,产物里就是原字面量。
- **值一律写 hex** → 设计稿口径,源码即事实来源,不做二次编码(oklch 之类中间
  表示不带来收益 —— 实测 hex 与 oklch 的产出色值完全等价,hex 还少 11KB)。

### 透明度写法(重要,别被产物误导)

**直接用 Tailwind 原生 `bg-X/10`、`border-X/25`**,不需要预置 rgba 槽。

Tailwind 4 会为透明度修饰符生成 `@supports` 渐进降级,产物形如:

```css
.bg-success\/10{background-color:var(--color-success)}
@supports (color:color-mix(in lab, red, red)){
  .bg-success\/10{background-color:color-mix(in oklab, var(--color-success) 10%, transparent)}
}
```

支持 `color-mix()` 的客户端取第二条(正确 alpha),不支持的取第一条(实色兜底)。
本项目的三个平台客户端均支持,alpha 正常生效。

⚠️ **排查陷阱**:只看第一条规则(如用 `grep -o '\.bg-X{...}'` 但不跨 `@supports`)会
误判成「alpha 丢了、退化成实心色」—— 我们踩过这个坑,并因此错误地引入了一批
rgba 扩展槽。核对时**必须连 `@supports` 块一起看**。

### 两条通道的选择依据(改色前先对号入座)

| 场景 | 通道 | 写法 |
|---|---|---|
| daisyUI 标准语义色 | ① 主题块 | `--color-primary: #8AD654` |
| 语义色的透明度变体 | 组件里直接用 | `bg-success/10`、`border-warning/35`(步进任意) |
| 亮暗通用、纯 hex 色板 | ② `@theme` | `--color-dot-frame: #0ea5e9`,自动出工具类 |
| 真 CSS 场景(伪元素等) | `:root` 变量 | 如 `--color-scrollbar-thumb` |

⚠️ **`@theme` 必须放在 `@plugin "daisyui"` 之前** —— 放之后会被 daisyUI 的插件
处理吞掉(实测:变量与工具类双双消失,且不报任何错),极难排查。

### ⚠️ 主题块必须自带「结构变量」(踩过的坑)

`@plugin "daisyui/theme"` 里**只写 `--color-*` 是不够的**。daisyUI 5 的 `.btn` /
`.input` / `.tab` 等组件还读一套**非颜色**变量:

```css
--radius-selector  --radius-field  --radius-box
--size-selector    --size-field
--border           --depth        --noise
```

**daisyUI 内置主题(`light`/`dark`/…)每套都带这些默认值,自定义主题不给默认值。**
漏写 → `var(--border)` 解析失败 → `border-width` 回退到 CSS 初始值 `medium`(=3px)
→ **按钮/输入框出现一圈粗黑边**(黑边是 `currentColor`,不是我们的色板出问题)。

实测:曾因此让全部 `btn` 变成 3px 黑框。两个主题块(亮/暗)必须**各自**声明这套
变量,值对齐 daisyUI 默认(`--border:1px; --depth:1; --noise:0;` 圆角/尺寸 0.25–0.5rem)。

排查口诀:`grep -o '\-\-border:[^;}]*' dist/ui.html` 有输出才算对。

### ⚠️ 层(layer)纪律:无层裸 CSS 会压制 daisyUI

Tailwind 4 的层序是 `theme → base → components → utilities → daisyui.*`。
**无层的裸规则不属于任何层,恒定压制所有层** —— 写在 `index.css` 末尾那几段
(`:root` 滚动条、`html,body` 底色)因此盖着 daisyUI,这是**有意**的:

- daisyUI 的 base 层把 `:root` 设成 `--root-bg`(= base-100),我们靠无层的
  `html,body{background-color:var(--color-base-200)}` 抢过来。语义上 body 才是
  可见底,别为了「规整」把它挪进 `:root` —— 一挪就输给 daisyUI,面板底部会露色带。
- 自建的**工具类**(`hint-enter` / `drawer-enter` / `badge-spin` + 它们的
  `@keyframes`)已统一收进 `@layer utilities`,与 daisyUI 同层、按源码顺序正常
  竞争,不再靠「无层」赢。

新增裸规则前先想清楚:它会盖过 `btn`/`badge`/`input` 等所有组件样式。


| Token | 亮色 | 暗色 | 角色 | 当前使用点 |
|---|---|---|---|---|
| `primary` | `#8AD654` | 同 | **品牌动作色**:主按钮(刻意与状态绿不同) | btn-primary |
| `secondary` | `#333333` | `#c9cfd6` | 次级实心表面(暂无直接使用,保留兼容) | — |
| `accent` | `#F76868` | 同 | **品牌珊瑚红**,仅品牌图形;不是状态色。面板内暂无使用点,品牌原稿见仓库根 `logo.svg` | — |
| `neutral` | `#2a2a2a` | `#2f3640` | 中性实心表面(暂无直接使用:平台名已降为页头 mono 小字,见 `App.tsx` 页头) | — |
| `base-100/200/300` | 白系三档 | 深灰蓝三档 | 面板底 / hover / 边框 | 全局 |
| `base-content` | `#333333` | `#d6dbe2` | 正文与透明度派生(`/60``/70`) | 全局 |
| `info` | `#2563eb` | `#5aa9f7` | 过渡状态(连接中) | StatusBadge |
| `success` | `#15803d` | `#34c467` | 成功 / 已连接 / 复制成功反馈 | StatusBadge、ConnectionHint、SelectionCard |
| `warning` | `#b45309` | `#f59e0b` | 警告 / 待服务 / 日志 warn 行 | LogDrawer、StatusBadge、ConnectionHint |
| `error` | `#d02626` | `#f87171` | 错误 / 日志 error 行 / 日志入口未读态 | LogDrawer、LogTrigger |

**error 为何不是常见的 `#dc2626` / `#ef4444`**:这两条是 Tailwind red-500 原值,
但它是**唯一被用作 12px 正文压在自淡底上**的语义色(`bg-error/6`、`bg-error/10`),
必须按 4.5:1 过。原值实测亮色 `/6` 只有 4.40、`/10` 4.14;暗色更糟,`/6` 与 `/10`
双双 3.84 —— 暗色那档是实打实不合格。故:

- 亮色压暗一档 `#dc2626 → #d02626`(oklch 色相 27.3→27.1、L 0.577→0.555,肉眼无差),`/6` 4.80、`/10` 4.50
- 暗色提亮一档 `#ef4444 → #f87171`(自带色 `text-error` 落 base-100 从 4.00 → 5.72),`/6` 5.28、`/10` 4.97

其余语义色(info/success/warning)在各自淡底上均已达标(warning 最低 4.38 属误差带,不动)。
改动色值后**必须重跑**对比度核验,勿凭肉眼。

## 二、标准用法(写组件前先对号入座)

1. **状态/提示「淡底组合」**(徽章、提示条的标准式):
   ```html
   border border-X/25 bg-X/10 text-X
   ```
   直接用 Tailwind 原生透明度修饰符,比例按场景取:

   | 场景 | 底色 | 描边 | 使用点 |
   |---|---|---|---|
   | 状态徽章 | `/10` | `/25` | StatusBadge 四态、LogTrigger 未读态 |
   | 提示条 | `/8` | `/35` | ConnectionHint 三条 |
   | 日志 error 行 | `/6` | — | LogDrawer(比提示条更轻,不抢文字) |

   文字用语义实心色 `text-X`,亮暗值均已按 ≥4.5:1 校准。alpha 由 Tailwind 的
   `@supports (color:color-mix(...))` 降级链保证,详见上文「透明度写法」。
   现例:StatusBadge 四态(connected / connecting / waiting,superseded 复用 waiting)、
   ConnectionHint 三条提示、LogTrigger 未读态 —— 后者是 `border-error/25` 的
   唯一使用点:通道与错误是两根轴,绿色状态徽章说不出「连上了但在报错」。

2. **正文着色**:直接 `text-X`(warn/error 日志行);中性正文用
   `text-base-content`,弱化层级用 `/60`(次级元数据)~ `/70`(仍需达标的正文)。

3. **content 色**(`X-content`):按「淡底贴近 base-100」场景校准——亮色主题是深字、
   暗色主题是浅字,**禁止拿它配实心 X 底**(实心底配对场景目前不存在)。

## 三、登记在册的例外(非语义色)

| 位置 | 类名 / 变量 | 原因 |
|---|---|---|
| `SelectionCard.tsx` `TYPE_DOT` | `bg-dot-*`(值在 `@theme` 分类色板) | 类型点为装饰性(类型有文字),与语义色解耦;换色改 index.css 一处 |
| `index.css` 滚动条 | `var(--color-scrollbar-thumb[-hover])` | 中性半透明灰,亮暗通用;伪元素场景工具类表达不了,故走 `:root` 变量 |

## 四、校准规则速查

- 小字正文对比度 ≥4.5:1(WCAG AA);纯装饰元素豁免。
- 信息不得仅靠颜色传达:warn/error 行有 ⚠/✕ 字形标记,状态徽章有色点+文字。
- 动效须尊重 `prefers-reduced-motion`(index.css 已全局兜底)。
- 改任何 token 后:`pnpm --filter text-to-design-ui typecheck && build`,
  并在亮/暗两种系统主题下各过一眼面板。