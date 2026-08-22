import { createMemo } from 'solid-js';
import { useBridge } from '../bridge/useBridge';

const STYLE = {
  connected: 'badge-success',
  connecting: 'badge-info',
  waiting: 'badge-warning',
} as const;

const LABEL = {
  connected: '已连接',
  connecting: '连接中…',
  waiting: '等待服务',
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
          : 'waiting';
    return k;
  });
  return (
    <span
      class={`badge badge-sm gap-1 ${STYLE[key()]}`}
      title="服务离线时无需手动操作,AI 调用会自动拉起"
    >
      <span class="text-[0.5rem] leading-none">●</span>
      {LABEL[key()]}
    </span>
  );
}
