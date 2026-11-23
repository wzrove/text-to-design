import { createSignal, onCleanup } from 'solid-js';
import { PANEL_MINIMIZED_SIZE } from 'text-to-design-shared';
import { useBridge } from '../bridge/useBridge';
import { t } from '../i18n/useLocale';
import PetLogo, { type PetPhase } from './PetLogo';

/**
 * 最小化视图:整屏只放笔宠物(窗口尺寸由 code 侧按模式算,见 shared/panel.ts)。
 *
 * 交互只有鼠标两项:
 * - **单击**:复制当前所有选中节点(设计/代码按面板里的模式)。
 * - **双击**:放大面板。
 * - **悬停**:title / aria 给出两条手势的说明。
 *
 * `tabindex={-1}`:75px 宠物是快捷键入口而非表单控件,不进页面的 Tab 顺序;
 * 键盘焦点交接由插件外壳/宿主负责,面板不在这里另开一套快捷键。
 *
 * 单击不能立刻执行:双击必然先触发两次 click。这里用 220ms 定时器分开 ——
 * 第二次 click 取消计时,交给 dblclick 去恢复,避免「想放大却顺手复制了两份」。
 *
 * 复制结果只用宠物相位反馈(SVG 打勾/抖叉):ToastHost 在最小化树里已卸载;
 * 75px 窗口也放不下文字胶囊。相位约 1s 后回到 daemon 推送的 activity。
 */
export default function MinimizedPet(props: {
  onRestore: () => void;
  onCopy: () => Promise<boolean>;
}) {
  const { activity } = useBridge();
  const [phase, setPhase] = createSignal<PetPhase | null>(null);
  let clickTimer: number | undefined;
  let phaseTimer: number | undefined;
  let copying = false;

  const clearClick = (): void => {
    if (clickTimer !== undefined) window.clearTimeout(clickTimer);
    clickTimer = undefined;
  };
  const clearPhase = (): void => {
    if (phaseTimer !== undefined) window.clearTimeout(phaseTimer);
    phaseTimer = undefined;
  };
  const flash = (next: PetPhase): void => {
    clearPhase();
    setPhase(next);
    phaseTimer = window.setTimeout(
      () => {
        phaseTimer = undefined;
        setPhase(null);
      },
      next === 'success' ? 1000 : 700,
    );
  };

  const runCopy = async (): Promise<void> => {
    if (copying) return;
    copying = true;
    let ok = false;
    try {
      ok = await props.onCopy();
    } finally {
      copying = false;
    }
    flash(ok ? 'success' : 'error');
  };

  onCleanup(() => {
    clearClick();
    clearPhase();
  });

  return (
    <button
      type="button"
      tabindex={-1}
      class="btn btn-ghost relative h-screen w-screen overflow-hidden rounded-none p-0 hover:bg-transparent"
      onClick={() => {
        // 第二次 click 属于双击序列:不排队复制,等 dblclick 恢复
        if (clickTimer !== undefined) {
          clearClick();
          return;
        }
        clickTimer = window.setTimeout(() => {
          clickTimer = undefined;
          void runCopy();
        }, 220);
      }}
      onDblClick={() => {
        clearClick();
        props.onRestore();
      }}
      title={t('pet.hint')}
      aria-label={t('pet.hint')}
    >
      <span
        class="absolute top-0 left-0 flex shrink-0 items-center justify-center"
        style={{
          width: `${PANEL_MINIMIZED_SIZE}px`,
          height: `${PANEL_MINIMIZED_SIZE}px`,
        }}
      >
        <PetLogo phase={phase() ?? activity()} />
      </span>
    </button>
  );
}
