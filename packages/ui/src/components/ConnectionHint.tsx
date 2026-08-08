import { createMemo, createSignal } from 'solid-js';
import { useBridge } from '../bridge/useBridge';
import { copyText } from '../utils/clipboard';

const INSTALL_CMD = 'npx -y text-to-design-mcp@latest';
const GITHUB_URL = 'https://github.com/wzrove/text-to-design';

/** 连接引导:未连接时给安装/启动指引;连接中时轻提示;已连接给使用引导 */
export default function ConnectionHint() {
  const { status } = useBridge();
  const [copied, setCopied] = createSignal(false);
  // 防抖:状态抖动窗口内不切换提示条,取稳定后的状态

  const copyCmd = () => {
    copyText(INSTALL_CMD);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const _status = createMemo(() => {
    const s = status();
    return s !== 'connected';
  });

  // memo 派生:display 变化返回对应提示条;元素内表达式惰性求值,
  // copied 反馈走细粒度更新,不会重建整个提示条
  const hint = createMemo(() => {
    switch (_status()) {
      case true:
        return (
          <div class="hint-enter rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs">
            <div class="font-bold text-warning-content">尚未连接 AI 服务</div>
            <p class="mt-1 text-warning-content/80">
              插件已经准备好。当你让 AI
              助手操作画布时,服务会自动启动;也可以先手动安装,装好后重启 AI
              会话就能用。
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                class={`btn btn-xs btn-outline ${copied() ? 'text-success' : ''}`}
                onClick={copyCmd}
              >
                {copied() ? '✓ 已复制' : '复制安装命令'}
              </button>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                class="btn btn-xs btn-ghost"
              >
                查看安装教程
              </a>
            </div>
          </div>
        );
      default:
        return (
          <div class="hint-enter rounded-lg border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs text-success-content/90">
            已连接。选中画布节点后点「复制」,把内容发给 AI
            助手——例如:「按这个节点样式帮我再做一张卡片」
          </div>
        );
    }
  });

  return <>{hint()}</>;
}
