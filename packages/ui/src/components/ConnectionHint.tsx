import { createMemo, createSignal } from 'solid-js';
import { useBridge } from '../bridge/useBridge';
import { copyText } from '../utils/clipboard';

const INSTALL_CMD = [
  '请帮我完成 text-to-design 安装:',
  '',
  '1. 注册 MCP 服务:用你工具原生的方式注册一个 stdio MCP server,',
  '   命令 npx -y text-to-design-mcp@latest(无需手动安装,npx 会自动拉取运行)。',
  '',
  '2. 注册完成后告知我即可。',
].join('\n');
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

  const disconnected = createMemo(() => status() !== 'connected');

  // memo 派生:display 变化返回对应提示条;元素内表达式惰性求值,
  // copied 反馈走细粒度更新,不会重建整个提示条
  const hint = createMemo(() => {
    switch (disconnected()) {
      case true:
        return (
          <div class="hint-enter rounded-lg border border-[var(--component-hint-warn-border)] bg-[var(--component-hint-warn-bg)] p-2.5 text-xs">
            <div class="font-bold text-warning-content">尚未连接 AI 服务</div>
            <p class="mt-1 text-warning-content/80">
              打开你的 AI 助手,点下方「复制给 AI
              助手」把安装步骤复制过去,直接粘贴给它并发送。它会自动完成注册;完成后重启
              AI 会话即可连接。
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                class={`btn btn-xs btn-outline ${copied() ? 'text-success' : ''}`}
                onClick={copyCmd}
              >
                {copied() ? '✓ 已复制' : '复制给 AI 助手'}
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
          <div class="hint-enter rounded-lg border border-[var(--component-hint-ok-border)] bg-[var(--component-hint-ok-bg)] px-2.5 py-1.5 text-xs text-success-content/90">
            已连接。选中画布节点后点「复制」,把内容发给 AI
            助手——例如:「按这个节点样式帮我再做一张卡片」
          </div>
        );
    }
  });

  // 连接状态是关键上下文:切换时经 polite live region 播报,不打断当前朗读
  return (
    <div role="status" aria-live="polite">
      {hint()}
    </div>
  );
}
