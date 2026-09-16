import { createMemo, createSignal } from 'solid-js';
import { useBridge } from '../bridge/useBridge';
import { copyText } from '../utils/clipboard';

/**
 * 给 AI 的指令:注册 + 唤醒。
 *
 * 第 2 步是唤醒动作——shim 收到 jsd_ping 时若探不到 daemon 会 detached 拉起
 * (daemon/run.ts runShim),所以「调一次 ping」就等于「把后台服务叫起来」。
 * README 的第三步讲的就是这件事,这里让文案直说,用户不必自己推导。
 */
const WAKE_CMD = [
  '请帮我连接 text-to-design 后台服务:',
  '',
  '1. 若尚未注册 MCP 服务:用你工具原生的方式注册一个 stdio MCP server,',
  '   命令 npx -y text-to-design-mcp@latest(无需手动安装,npx 会自动拉取运行)。',
  '',
  '2. 注册后调用 jsd_ping —— 这一步会唤醒(必要时自动拉起)后台常驻服务。',
  '   若返回「插件未连接」,请提示我在设计软件里运行 text-to-design 插件。',
].join('\n');

/**
 * 手动常驻启动:daemon 子命令幂等(已有同版本实例直接退出,见 run.ts
 * ensureSoleDaemon),所以这条命令可以反复执行,也能写进 alias / 开机脚本。
 */
const DAEMON_CMD = 'npx -y text-to-design-mcp@latest daemon';

const GITHUB_URL = 'https://github.com/wzrove/text-to-design';

type CopyKind = 'ai' | 'daemon';

/** 连接引导:未连接给两条可执行路径;连接中轻提示;已连接给使用引导 */
export default function ConnectionHint() {
  const { status, port } = useBridge();
  const [copied, setCopied] = createSignal<CopyKind | null>(null);

  const copy = (kind: CopyKind, text: string) => {
    copyText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1500);
  };

  // memo 派生:display 变化返回对应提示条;元素内表达式惰性求值,
  // copied 反馈走细粒度更新,不会重建整个提示条
  const hint = createMemo(() => {
    const s = status();

    if (s === 'connected') {
      return (
        <div class="hint-enter rounded-lg border border-[var(--component-hint-ok-border)] bg-[var(--component-hint-ok-bg)] px-2.5 py-1.5 text-xs text-success-content/90">
          已连接。选中画布节点后点「复制」,把内容发给 AI
          助手——例如:「按这个节点样式帮我再做一张卡片」
        </div>
      );
    }

    // 连接中:与 StatusBadge「连接中…」同源同色,不再重复安装教程
    // (历史 bug:connecting 曾被当成「尚未连接」,与徽章文案自相矛盾)
    if (s === 'connecting') {
      return (
        <div class="hint-enter rounded-lg border border-[var(--component-status-chip-connecting-border)] bg-[var(--component-status-chip-connecting-bg)] px-2.5 py-1.5 text-xs text-info-content/90">
          正在连接后台服务(ws://localhost:{port()}
          ),等待服务确认。若长时间停在此处,点右上角「重试」。
        </div>
      );
    }

    // 被顶替:daemon 在、通道被另一个面板占用。这条不自动重连(否则两个面板
    // 会互相顶替),只给一个手动动作
    if (s === 'superseded') {
      return (
        <div class="hint-enter rounded-lg border border-[var(--component-status-chip-waiting-border)] bg-[var(--component-status-chip-waiting-bg)] px-2.5 py-1.5 text-xs text-warning-content/90">
          通道已被另一个插件面板接管(同一时刻只服务一个面板)
          ,自动重连已停止。点右上角「夺回」切回本面板。
        </div>
      );
    }

    // 未连接/错误:两条可执行路径,而不是重复一遍安装教程
    return (
      <div class="hint-enter rounded-lg border border-[var(--component-hint-warn-border)] bg-[var(--component-hint-warn-bg)] p-2.5 text-xs">
        <div class="flex items-center gap-2">
          <span class="font-bold text-warning-content">尚未连接后台服务</span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            class="ml-auto shrink-0 text-warning-content/70 underline"
          >
            安装教程
          </a>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class={`btn btn-xs btn-outline ${copied() === 'ai' ? 'text-success' : ''}`}
            onClick={() => copy('ai', WAKE_CMD)}
          >
            {copied() === 'ai' ? '✓ 已复制' : '① 复制给 AI 助手'}
          </button>
          <span class="text-warning-content/80">
            发给 AI,让它调用 jsd_ping 唤醒后台服务
          </span>
        </div>

        <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class={`btn btn-xs btn-outline ${copied() === 'daemon' ? 'text-success' : ''}`}
            onClick={() => copy('daemon', DAEMON_CMD)}
          >
            {copied() === 'daemon' ? '✓ 已复制' : '② 复制启动命令'}
          </button>
          <code
            class="min-w-0 truncate rounded bg-base-100/60 px-1 py-0.5 font-mono text-[10px] text-warning-content/80"
            title={DAEMON_CMD}
          >
            {DAEMON_CMD}
          </code>
        </div>
        <p class="mt-1 text-warning-content/70">
          在本机终端执行即常驻到下次重启;重复执行安全(已有实例会自动跳过)。
        </p>
      </div>
    );
  });

  // 连接状态是关键上下文:切换时经 polite live region 播报,不打断当前朗读
  return (
    <div role="status" aria-live="polite">
      {hint()}
    </div>
  );
}
