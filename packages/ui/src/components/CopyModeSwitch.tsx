import { Code2, PenTool } from '@lucide/solid';
import { dynamicComponent, For } from 'solid-js';
import type { CopyRequest, MessageKey } from 'text-to-design-shared';
import { t } from '../i18n/useLocale';
import { TOGGLE_ACTIVE, TOGGLE_IDLE } from '../utils/toggleStyles';
import Tooltip from './Tooltip';

const ITEMS = [
  {
    mode: 'design' as const,
    icon: PenTool,
    label: 'selection.code.design' as MessageKey,
  },
  {
    mode: 'code' as const,
    icon: Code2,
    label: 'selection.code.code' as MessageKey,
  },
];

/**
 * 头部的 Copy 模式开关。
 *
 * 造型与右侧日志 / ⋯ 同族:独立的 ghost 图标钮,选中才补相机锁那套
 * (描边 + 淡底 + 实心文字)。不再套外框轨道 —— 页头里已有状态胶囊与一组
 * ghost 图标,再加一块描边容器会多出一层「卡片里的卡片」。
 *
 * 两个图标都挂 Tooltip:图标本身没有文字,悬停给「设计 / 代码」全名。
 */
export default function CopyModeSwitch(props: {
  mode: CopyRequest['mode'];
  onModeChange: (mode: CopyRequest['mode']) => void;
}) {
  return (
    <div
      class="flex shrink-0 items-center gap-0.5"
      role="group"
      aria-label={t('selection.code.modeLabel')}
    >
      <For each={ITEMS}>
        {(item) => {
          const Icon = dynamicComponent(() => item.icon);
          return (
            <Tooltip tip={t(item.label)} class="shrink-0">
              <button
                type="button"
                class={`btn btn-ghost btn-xs border px-1 ${
                  props.mode === item.mode
                    ? `${TOGGLE_ACTIVE} hover:bg-base-content/20`
                    : TOGGLE_IDLE
                }`}
                aria-label={t(item.label)}
                aria-pressed={props.mode === item.mode ? 'true' : 'false'}
                onClick={() => props.onModeChange(item.mode)}
              >
                <Icon size={14} />
              </button>
            </Tooltip>
          );
        }}
      </For>
    </div>
  );
}
