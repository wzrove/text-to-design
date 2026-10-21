import logoUrl from '../../../../logo.svg';
import { t } from '../i18n/useLocale';

/**
 * 最小化视图:整屏只放 logo(窗口尺寸由 code 侧按模式算,见 shared/panel.ts)。
 *
 * 恢复手势挂双击而不是单击:单击是「选中/聚焦」的通用含义,拿它当恢复会让误触即
 * 跳出最小化。键盘同样要能恢复 —— 只给双击等于把面板锁死给鼠标用户。
 */
export default function MinimizedLogo(props: { onRestore: () => void }) {
  return (
    <button
      type="button"
      class="btn btn-ghost h-screen w-screen overflow-hidden rounded-none p-0 hover:bg-transparent"
      onDblClick={props.onRestore}
      title={t('header.restore.title')}
      aria-label={t('header.restore.title')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onRestore();
        }
      }}
    >
      <img
        src={logoUrl}
        alt="text-to-design"
        class="size-12 shrink-0"
        draggable={false}
      />
    </button>
  );
}
