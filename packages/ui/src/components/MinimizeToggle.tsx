import { Minus } from 'lucide-solid';
import { t } from '../i18n/useLocale';
import Tooltip from './Tooltip';

/**
 * 最小化入口。挂不挂由调用方定:宿主没有 ui.resize 时窗口缩不下去,
 * 一颗按不动的钮比没有更糟(见 App.tsx)。
 */
export default function MinimizeToggle(props: { onClick: () => void }) {
  return (
    <Tooltip tip={t('header.minimize.title')}>
      <button
        type="button"
        class="btn btn-ghost btn-xs shrink-0 px-1 text-base-content/60 hover:text-base-content"
        aria-label={t('header.minimize')}
        onClick={props.onClick}
      >
        <Minus size={14} />
      </button>
    </Tooltip>
  );
}
