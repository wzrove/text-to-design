import { useBridge } from '../bridge/useBridge';
import { t } from '../i18n/useLocale';
import PetLogo from './PetLogo';

/**
 * 最小化视图:整屏只放笔宠物(窗口尺寸由 code 侧按模式算,见 shared/panel.ts)。
 *
 * 宠物的相位来自 daemon 的 activity 推送帧 —— 最小化后用户看不到面板里的一切,
 * 这只宠物是「模型正在干活 / 刚成功 / 刚失败」的唯一出口。
 *
 * 恢复手势挂双击而不是单击:单击是「选中/聚焦」的通用含义,拿它当恢复会让误触即
 * 跳出最小化。键盘同样要能恢复 —— 只给双击等于把面板锁死给鼠标用户。
 *
 * 相位只影响外观,不影响可交互性:任何相位下双击/回车都能恢复。
 */
export default function MinimizedPet(props: { onRestore: () => void }) {
  const { activity } = useBridge();

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
      <PetLogo phase={activity()} />
    </button>
  );
}
