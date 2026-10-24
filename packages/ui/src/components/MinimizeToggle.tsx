import { Minimize2 } from 'lucide-solid';
import logoUrl from '../../logo.svg';
import { t } from '../i18n/useLocale';
import Tooltip from './Tooltip';

/**
 * 最小化入口。挂不挂由调用方定:宿主没有 ui.resize 时窗口缩不下去,
 * 一颗按不动的钮比没有更糟(见 App.tsx)。
 *
 * 图标常态是 Minimize2,悬停换成 logo.svg 的猫(20px 渲染 + 定位裁掉文件
 * 自带的 ~15% 留白,只收紧视觉边距、不动文件),交叉淡入 + 缩放过渡 ——
 * 「点下去会变成宠物」的预告。
 */
export default function MinimizeToggle(props: { onClick: () => void }) {
  return (
    <Tooltip tip={t('header.minimize.title')}>
      <button
        type="button"
        class="btn btn-ghost btn-xs group shrink-0 px-1 text-base-content/60 hover:text-base-content"
        aria-label={t('header.minimize')}
        onClick={props.onClick}
      >
        <span class="relative block h-4 w-4">
          <Minimize2
            size={14}
            class="absolute inset-0 m-auto transition-all duration-200 group-hover:scale-50 group-hover:opacity-0"
          />
          <span class="absolute inset-0 block scale-50 overflow-hidden opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
            <img
              src={logoUrl}
              alt=""
              draggable={false}
              class="absolute left-[-2.5px] top-[-1.9px] h-5 w-5"
            />
          </span>
        </span>
      </button>
    </Tooltip>
  );
}
