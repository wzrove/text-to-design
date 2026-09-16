import { createMemo, createSignal } from 'solid-js';
import type { BridgeStatus } from '../bridge/BridgeSocket';
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

/**
 * 提示条形态只有三种。
 *
 * 「连接中」**不是**其中一种:它是时间维度上的进行时,反馈落在 StatusBadge 的
 * 转圈上,不需要提示条换脸 —— 连接期间「后台服务尚未连接」依然是事实,引导卡上
 * 那两条路径也依然可执行,没有换掉的理由。status 如实上报,不在此处做时间修饰。
 */
type Variant = 'connected' | 'superseded' | 'disconnected';

/**
 * 卡片外观:每个形态给一整串(描边/底色/内边距),不做多串叠加 —— 叠加时
 * px-2.5 与 p-2.5 谁生效取决于生成顺序,不可控。文字色由内层元素各带各的。
 */
const CARD: Record<Variant, string> = {
  connected:
    'px-2.5 py-1.5 border-[var(--component-hint-ok-border)] bg-[var(--component-hint-ok-bg)]',
  superseded:
    'px-2.5 py-1.5 border-[var(--component-status-chip-waiting-border)] bg-[var(--component-status-chip-waiting-bg)]',
  disconnected:
    'p-2.5 border-[var(--component-hint-warn-border)] bg-[var(--component-hint-warn-bg)]',
};

/** live region 播报文案:按真实 status 取(含 connecting),压到一行,不念整张引导卡 */
const ANNOUNCE: Record<BridgeStatus, string> = {
  connected: '已连接后台服务',
  connecting: '正在连接后台服务',
  superseded: '通道已被另一个插件面板接管',
  disconnected: '尚未连接后台服务',
};

/** 连接引导:未连接给两条可执行路径;已连接给使用引导;被顶替给夺回动作 */
export default function ConnectionHint() {
  const { status } = useBridge();
  const [copied, setCopied] = createSignal<CopyKind | null>(null);

  const copy = (kind: CopyKind, text: string) => {
    copyText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1500);
  };

  const variant = createMemo<Variant>(() => {
    const s = status();
    if (s === 'connected' || s === 'superseded') return s;
    // connecting 与 disconnected 同属「还没连上」,共用引导卡
    return 'disconnected';
  });

  /* 单行形态文案:节点常驻,切换时只换文本 + 文字色 */
  const line = createMemo(() => {
    switch (variant()) {
      case 'connected':
        return {
          cls: 'text-success-content/90',
          text: '已连接。选中画布节点后点「复制」,把内容发给 AI 助手——例如:「按这个节点样式帮我再做一张卡片」',
        };
      case 'superseded':
        return {
          cls: 'text-warning-content/90',
          text: '通道已被另一个插件面板接管(同一时刻只服务一个面板),自动重连已停止。点右上角「夺回」切回本面板。',
        };
      default:
        // 断开态:这一行让位给下面的引导卡,自身隐藏留白
        return { cls: 'hidden', text: '' };
    }
  });

  // 连接状态是关键上下文:形态变化时播报;live region 节点常驻,故另起一处
  // sr-only 载体 —— 可见部分只改显隐,屏读器不会播报显隐变化
  return (
    <div>
      <div role="status" aria-live="polite" class="sr-only">
        {ANNOUNCE[status()]}
      </div>

      {/*
        形态切换只改显隐,不重建 DOM:掉线与被顶替会让形态来回切,而一旦按形态
        返回新 JSX,整块提示条就被卸载重建 —— hint-enter 重播、按钮焦点与
        「已复制」反馈尽失,看起来就是「组件在重载」

        连接期间此处刻意保持引导卡:徽章那边转圈说明「正在连」,这边说的是
        「还没连上」—— 两句都真,且引导卡的两条路径此刻依然可执行
      */}
      <div class={`hint-enter rounded-lg border text-xs ${CARD[variant()]}`}>
        <p class={line().cls}>{line().text}</p>

        <div classList={{ hidden: variant() !== 'disconnected' }}>
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
      </div>
    </div>
  );
}
