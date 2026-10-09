import { For } from 'solid-js';
import { dismissToast, type ToastLevel, toasts } from '../utils/toast';

/**
 * 轻提示挂载点(见 0037)。用 daisyUI 的 `toast`:定位(`fixed` 右下)、堆叠方向
 * 与入场动画都是它给的,组件只负责「一条提示长什么样」。
 *
 * **条目不用 daisyUI 的 `.alert` + 语义色**:`.alert-success` 走的是**实心底**
 * 配 `--color-success-content`,而本主题的 `*-content` 是按「淡底贴近 base-100」
 * 校准的(见 index.css 规则②,亮色主题取深字)—— 拿它配实心底在亮色下只有
 * 2 倍出头的对比度。这里沿用面板既有的「淡底组合」(规则①),与状态徽章、
 * 连接提示条同一套配色。
 *
 * **挂载即固定在右下**:`fixed` 不进流,所以它不参与 PanelHeightSync 量出的
 * 内容高度(0014)—— 弹提示不会把面板撑高。盖在日志抽屉的遮罩(z-30)之上,
 * 是因为操作它的是刚点完按钮的人。
 *
 * `role="status"` 的容器**常驻**(空着也留在 DOM 里):live region 若随首条提示
 * 一起挂载,屏读器多半不念第一句 —— 这是面板里其它播报点同一套做法。
 */
const ITEM: Record<ToastLevel, string> = {
  success: 'border-success/35 bg-success/10 text-success',
  error: 'border-error/35 bg-error/10 text-error',
};

export default function ToastHost() {
  return (
    <div
      role="status"
      aria-live="polite"
      class="toast toast-end toast-bottom z-50  backdrop-blur-sm"
    >
      <For each={toasts()}>
        {(item) => (
          /* 点一下即撤下(不用等它自己淡出);button 而不是挂 onClick 的 div */
          <button
            type="button"
            class={`flex items-center rounded-lg border px-2.5 py-1.5 text-xs shadow-md ${ITEM[item.level]}`}
            onClick={() => dismissToast(item.id)}
          >
            {item.message}
          </button>
        )}
      </For>
    </div>
  );
}
