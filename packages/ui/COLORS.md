# UI 配色体系(text-to-design 插件)

> 分层事实来源:`design-tokens.json`(Primitive 原始值)→
> `src/styles/tokens.css`(生成的 Component 层 CSS 变量)→
> `tailwind.config.js`(daisyUI Semantic 主题)。本文档是使用说明书。
> 依据:ui-ux-pro-max 指南(对比度 ≥4.5:1、禁纯色传义、淡底组合规范)
> + design-system 三层 Token 架构。

## 〇、三层 Token 架构(design-system 规范)

```text
Primitive(design-tokens.json 原始色值)
        ↓ 语义别名
Semantic(tailwind.config.js daisyUI 主题 = 下表)
        ↓ 组件消费
Component(src/styles/tokens.css 的 --component-*,生成物勿手改)
```

再生成与校验(packages/ui 目录下执行):

```bash
node ../../.agents/skills/design-system/scripts/generate-tokens.cjs \
  --config design-tokens.json --output src/styles/tokens.css
node ../../.agents/skills/design-system/scripts/validate-tokens.cjs --dir src
```

| Token | 亮色 | 暗色 | 角色 | 当前使用点 |
|---|---|---|---|---|
| `primary` | `#8AD654` | 同 | **品牌动作色**:主按钮、Logo 主绿(刻意与状态绿不同) | btn-primary、Logo |
| `secondary` | `#333333` | `#c9cfd6` | 次级实心表面(暂无直接使用,保留兼容) | — |
| `accent` | `#F76868` | 同 | **品牌珊瑚红**,仅品牌图形;不是状态色 | Logo |
| `neutral` | `#2a2a2a` | `#2f3640` | 中性实心徽章 | EnvironmentBadge |
| `base-100/200/300` | 白系三档 | 深灰蓝三档 | 面板底 / hover / 边框 | 全局 |
| `base-content` | `#333333` | `#d6dbe2` | 正文与透明度派生(`/60``/70`) | 全局 |
| `info` | `#2563eb` | `#5aa9f7` | 过渡状态(连接中) | StatusBadge |
| `success` | `#15803d` | `#34c467` | 成功 / 已连接 / 复制成功反馈 | StatusBadge、ConnectionHint、SelectionCard |
| `warning` | `#b45309` | `#f59e0b` | 警告 / 待服务 / 日志 warn 行 | LogPanel、StatusBadge、ConnectionHint |
| `error` | `#dc2626` | `#ef4444` | 错误 / 日志 error 行 | LogPanel |

## 二、三种标准用法(写组件前先对号入座)

1. **状态/提示「淡底组合」**(徽章、提示条的标准式):
   ```html
   border border-[var(--component-status-chip-X-border)]
   bg-[var(--component-status-chip-X-bg)] text-X
   ```
   ⚠️ 本 webview 下 daisyUI 主题色的透明度修饰符(X/10、X/25)会退化成**实心色**
   (曾导致蓝底配蓝字),禁止直接写 `bg-X/10` 这类类名;淡底/描边一律用
   design-tokens.json 里 `status-chip` / `hint` 的 rgba token。文字用语义实心色
   (`text-X`,token 不受退化影响),亮暗值均已按 ≥4.5:1 校准。
   现例:StatusBadge 三态、ConnectionHint 两条提示。

2. **正文着色**:直接 `text-X`(warn/error 日志行);中性正文用
   `text-base-content`,弱化层级用 `/60`(次级元数据)~ `/70`(仍需达标的正文)。

3. **content 色**(`X-content`):按「淡底贴近 base-100」场景校准——亮色主题是深字、
   暗色主题是浅字,**禁止拿它配实心 X 底**(实心底配对场景目前不存在)。

## 三、登记在册的例外(非 token 颜色)

| 位置 | 颜色 | 原因 |
|---|---|---|
| `SelectionCard.tsx` `TYPE_DOT` | 引用 `--component-type-dot-*`(色值在 design-tokens.json 分类色板) | 类型点为装饰性(类型有文字),与语义 token 解耦;换色改 JSON 后重新生成 |
| `LogPanel.tsx` error 行衬底 | `var(--component-log-error-tint)`(固定 rgba) | oklch 回退在部分 webview 下丢透明度修饰符(`/5` 变实心),故收进 token 层用固定 rgba 兜底 |
| `Logo.tsx` | 品牌原稿色(#8AD654/#F76868/#333 等) | 设计稿原样,不随主题 |
| `index.css` 滚动条 | `var(--component-scrollbar-thumb[-hover])` | 中性半透明灰,亮暗通用 |

## 四、校准规则速查

- 小字正文对比度 ≥4.5:1(WCAG AA);纯装饰元素豁免。
- 信息不得仅靠颜色传达:warn/error 行有 ⚠/✕ 字形标记,状态徽章有色点+文字。
- 动效须尊重 `prefers-reduced-motion`(index.css 已全局兜底)。
- 改任何 token 后:`pnpm --filter text-to-design-ui typecheck && build`,
  并在亮/暗两种系统主题下各过一眼面板。