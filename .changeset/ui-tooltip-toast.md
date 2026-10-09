---
"text-to-design-ui": minor
"text-to-design-mcp": patch
---

feat(ui): 页头提示改用 daisyUI tooltip,操作结果统一走 toast(见 0037)

**提示**:页头五颗功能按钮(重连/夺回、相机锁、主题、语言、日志)的说明从原生 `title` 换成 daisyUI `tooltip` —— 原生提示延迟约一秒、样式由宿主定,而这几句都是长句(相机锁那句 26 个字),在 360 宽面板里会被 iframe 边缘裁掉半截。统一经新的 `Tooltip` 组件:`data-tip`、贴边方位(右侧工具簇贴右、左侧那颗贴左,居中放两头都会伸出面板)与包装元素的职责都收在一处;键盘可达沿用 daisyUI 的 `:has(:focus-visible)`,可访问名仍由各按钮自己的 `aria-label` 给出。气泡宽度在 `index.css` 收口到 12rem(daisyUI 默认 20rem 必然越界),那条规则写在层外,理由见文件内注释。

**反馈**:操作成功后的提示原先有四种写法(选中卡 `✓`、连接引导 `✓ 已复制`、日志行 `✓`、能力表刷新不出声,`setTimeout` 时长还不一致),现在统一到一个出口:`utils/toast.ts`(模块级唯一状态源,同文案只留最新一条并重新计时)+ `components/Toast.tsx`(唯一挂载点,daisyUI `toast` 提供定位/堆叠/入场动画,条目沿用面板的「淡底组合」而非 `.alert-*` 的语义实心底)+ `copyWithToast`(复制成败 → 文案 + 级别的唯一映射)。

尺子写死在 0037:只在**结果不可见或极易忽略**的操作上弹(复制、相机锁),界面本身已经变了的不弹(开合抽屉、切主题、清空日志、重连)。`fixed` 定位不进流,故弹提示不改变 `PanelHeightSync` 量出的内容高度。

i18n:增 `toast.copy.done` / `toast.copy.failed`,删已无引用的 `conn.copied` / `selection.copied`(键化沿 0016,两键删净不留在表里)。mcp 侧只是 dist 里跟着换一份 catalog,行为不变,故 patch。
