import { createMemo } from 'solid-js';
import { useBridge } from '../bridge/useBridge';

// 淡底深字替代实心徽章。⚠️ 本 webview 下 daisyUI 主题色的透明度修饰符(X/10、X/25)
// 会退化成实心色(蓝底配蓝字),故底色/描边一律用 design-tokens 生成的 rgba 组件层
// token;文字用语义实心色(token 本身不受影响),亮暗主题均已按 ≥4.5:1 校准
const STYLE = {
  connected:
    'border border-[var(--component-status-chip-connected-border)] bg-[var(--component-status-chip-connected-bg)] text-success',
  connecting:
    'border border-[var(--component-status-chip-connecting-border)] bg-[var(--component-status-chip-connecting-bg)] text-info',
  waiting:
    'border border-[var(--component-status-chip-waiting-border)] bg-[var(--component-status-chip-waiting-bg)] text-warning',
  superseded:
    'border border-[var(--component-status-chip-waiting-border)] bg-[var(--component-status-chip-waiting-bg)] text-warning',
} as const;

const LABEL = {
  connected: '已连接',
  connecting: '连接中…',
  waiting: '等待服务',
  superseded: '已被接管',
} as const;

const TITLE = {
  connected: '服务在线,插件与 AI 会话已连通',
  connecting: '已连上后台服务,等待它确认这条通道',
  waiting: '服务离线时无需手动操作,AI 调用会自动拉起',
  superseded: '另一个插件面板占用了通道;点「夺回」可切回本面板',
} as const;

type BadgeKey = keyof typeof LABEL;

export default function StatusBadge() {
  const { status } = useBridge();
  const key = createMemo<BadgeKey>(() => {
    const s = status();
    const k: BadgeKey =
      s === 'connected'
        ? 'connected'
        : s === 'connecting'
          ? 'connecting'
          : s === 'superseded'
            ? 'superseded'
            : 'waiting';
    return k;
  });
  return (
    <span
      role="status"
      aria-atomic="true"
      class={`badge badge-sm gap-1 ${STYLE[key()]}`}
      title={TITLE[key()]}
    >
      <span class="text-[0.5rem] leading-none">●</span>
      {LABEL[key()]}
    </span>
  );
}
