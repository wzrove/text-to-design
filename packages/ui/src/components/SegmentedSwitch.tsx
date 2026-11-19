import { For } from 'solid-js';
import {
  TOGGLE_ACTIVE,
  TOGGLE_IDLE,
  TOGGLE_TRACK,
} from '../utils/toggleStyles';

export type SegmentedItem = {
  value: string;
  label: string;
  /** 屏幕上只有缩写时补全名(中 / EN 这类) */
  ariaLabel?: string;
};

/**
 * 文本型两档直切开关(语言:中 / EN)。
 *
 * Copy 模式在页头用独立的 ghost 图标钮(见 CopyModeSwitch):页头已有状态胶囊
 * 与一组 ghost 图标,再套一层描边轨道会多出「卡片里的卡片」。这里保留文本组,
 * 给「缩写比图标更达意」的场合用。
 *
 * 选中 / 未选中色阶来自 `utils/toggleStyles`(与相机锁、角色 chips 同一套)。
 * 透明边框参与布局,切换时不会因补边框而跳动。
 */
export default function SegmentedSwitch(props: {
  items: readonly SegmentedItem[];
  value: string;
  onChange: (value: string) => void;
  /** 整组读给屏读器的名字 */
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={props.label}
      class={`flex shrink-0 items-center gap-0.5 ${TOGGLE_TRACK}`}
    >
      <For each={props.items}>
        {(item) => (
          <button
            type="button"
            aria-label={item.ariaLabel ?? item.label}
            aria-pressed={props.value === item.value}
            class={
              'cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none transition ' +
              (props.value === item.value ? TOGGLE_ACTIVE : TOGGLE_IDLE)
            }
            onClick={() => {
              if (props.value !== item.value) props.onChange(item.value);
            }}
          >
            {item.label}
          </button>
        )}
      </For>
    </div>
  );
}
