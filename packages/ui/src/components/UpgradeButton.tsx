import { ArrowUpCircle } from 'lucide-solid';
import { t } from '../i18n/useLocale';
import Tooltip from './Tooltip';

/**
 * 版本升级入口(见 0038)。
 *
 * **只有确有新版本时才挂载** —— 常态面板里一颗永远点不出东西的按钮是噪声,
 * 这条纪律与页头「重连」钮同源(App.tsx:连上后整颗隐藏而非置灰)。
 *
 * 纯图标不带文字:页头这一行两侧排着状态徽章与动作钮,文字按钮在两种状态下的
 * 宽度会变,整行跟着抖(同 CollapsibleSection 的收口)。
 *
 * `aria-label` 复用 tooltip 同一句:气泡不进无障碍树的可信路径,可访问名必须
 * 由按钮自己给出(见 Tooltip 的注释)。
 */
export default function UpgradeButton(props: {
  onClick: () => void;
  ref?: (el: HTMLButtonElement) => void;
}) {
  return (
    <Tooltip tip={t('upgrade.title')} align="end">
      <button
        ref={(el) => props.ref?.(el)}
        type="button"
        class="btn btn-ghost btn-xs shrink-0 px-1 text-warning hover:text-warning"
        aria-label={t('upgrade.title')}
        aria-haspopup="dialog"
        onClick={props.onClick}
      >
        <ArrowUpCircle size={14} />
      </button>
    </Tooltip>
  );
}
