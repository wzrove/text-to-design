import daisyui from 'daisyui';

/** @type {import('tailwindcss').Config} */

// ─── 配色体系总览(详见 packages/ui/COLORS.md)─────────────────────────
//
// ⚠️ 此文件是语义色(primary/accent/info/success/warning/error)的唯一来源。
// tokens.css 仅保留 daisyUI 不覆盖的色板(dot-scale、neutral-alpha)。
// 两者无 hex 重复:改颜色只改一处。
//
// 角色        亮色        暗色        用途
// primary    #8AD654    #8AD654    品牌动作色:btn-primary、Logo 主绿(与状态绿解耦)
/// secondary  #333333    #c9cfd6    次级实心表面(当前组件未直接使用,保留兼容)
/// accent     #F76868    #F76868    品牌珊瑚红:仅品牌图形(Logo),不作状态色
/// neutral    #2a2a2a    #2f3640    中性实心徽章(平台名)
/// base-*     白系        深灰蓝      面板底/hover/border 三档
/// info       #2563eb    #5aa9f7    过渡状态(连接中)
/// success    #15803d    #34c467    成功/已连接
/// warning    #b45309    #f59e0b    警告/待服务/日志 warn
/// error      #dc2626    #ef4444    错误/日志 error
//
// 使用规则(ui-ux-pro-max 指南校准):
// ① 状态/提示统一「淡底组合」:bg-X/10 + border-X/25 + text-X —— 本表 X 的亮色值
//    均按白底 ≥4.5:1 校准,暗色值按暗底校准;
// ② *-content 按「淡底贴近 base-100」的场景校准(亮色主题取深字、暗色取浅字),
//    不要拿它配实心底使用;
// ③ 信息不得仅靠颜色传达:warn/error 行另有 ⚠/✕ 字形与左色条;
// ④ 两处登记在册的例外:SelectionCard TYPE_DOT 分类色板(装饰性,类型有文字)、
//    LogPanel error 衬底 rgba(239,68,68,.06)(oklch 回退兜底);Logo 为品牌原稿色。

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        textdesign: {
          primary: '#8AD654',
          'primary-content': '#1a2b0e',
          secondary: '#333333',
          'secondary-content': '#ffffff',
          accent: '#F76868',
          'accent-content': '#ffffff',
          neutral: '#2a2a2a',
          'neutral-content': '#ffffff',
          'base-100': '#ffffff',
          'base-200': '#f5f7f2',
          'base-300': '#e9eee2',
          'base-content': '#333333',
          info: '#2563eb',
          'info-content': '#ffffff',
          success: '#15803d',
          'success-content': '#052e12',
          warning: '#b45309',
          'warning-content': '#3a2e00',
          error: '#dc2626',
          'error-content': '#ffffff',
        },
      },
      {
        // 暗色主题:main.tsx 按 prefers-color-scheme 切换 data-theme。
        // 状态色整体提亮一档以满足暗底对比;*-content 取浅色调(见规则②)
        textdesign_dark: {
          primary: '#8AD654',
          'primary-content': '#15230b',
          secondary: '#c9cfd6',
          'secondary-content': '#14171b',
          accent: '#F76868',
          'accent-content': '#2a0e0e',
          neutral: '#2f3640',
          'neutral-content': '#e5e7eb',
          'base-100': '#1d232a',
          'base-200': '#222931',
          'base-300': '#333a43',
          'base-content': '#d6dbe2',
          info: '#5aa9f7',
          'info-content': '#cfe6ff',
          success: '#34c467',
          'success-content': '#baf0cd',
          warning: '#f59e0b',
          'warning-content': '#ffe1ad',
          error: '#ef4444',
          'error-content': '#ffd0d0',
        },
      },
    ],
    darkTheme: 'textdesign_dark',
  },
};
