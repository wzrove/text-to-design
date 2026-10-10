import { ArrowRight, Bot, PlugZap, RefreshCw } from 'lucide-solid';
import { INSTALL_PROMPT, MCP_COMMAND } from '../content';
import { revealDelay } from '../motion';
import CopyButton from './CopyButton';
import Section from './Section';

const STEPS = [
  {
    icon: Bot,
    title: '把安装提示词丢给 AI',
    body: '后台服务由 AI 自己注册、自己验证,你不用碰配置文件。',
  },
  {
    icon: PlugZap,
    title: '手动导入设计软件插件',
    body: '在即时设计 / Figma / 莫高设计里选对应平台的 manifest.json,运行后面板显示「已连接」。',
  },
  {
    icon: RefreshCw,
    title: '重启 AI 会话',
    body: '让 AI 调用 jsd_ping 确认连通,通了就能开工。',
  },
];

export default function Install(props: { releasesUrl: string }) {
  return (
    <Section
      id="install"
      index="02 / 安装"
      title="三步装好"
      lead="第一步注册并验证后台服务,第二步按平台导插件,第三步重启会话握手。中间只有一步需要你手动点。"
    >
      <ol class="mt-12 grid gap-4 lg:grid-cols-3">
        {STEPS.map((step, i) => (
          <li
            data-reveal="up"
            style={revealDelay(i)}
            class="rounded-xl border border-line bg-panel p-5 transition-colors duration-300 hover:border-brand/40"
          >
            <div class="flex items-center justify-between">
              <step.icon size={18} class="text-brand" aria-hidden />
              <span class="mono-label">step {i + 1}</span>
            </div>
            <h3 class="mt-4 text-[15px] font-medium">{step.title}</h3>
            <p class="mt-2 text-sm leading-relaxed text-mute">{step.body}</p>
          </li>
        ))}
      </ol>

      <div
        data-reveal="fade"
        class="mt-8 overflow-hidden rounded-xl border border-line bg-panel"
      >
        <div class="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <p class="mono-label">复制给 AI 的提示词</p>
          <CopyButton
            text={INSTALL_PROMPT}
            label="复制完整安装提示词"
            class="ml-auto"
          />
        </div>
        <pre class="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-relaxed text-mute">
          {INSTALL_PROMPT}
        </pre>
        <div class="flex flex-wrap items-center gap-4 border-t border-line px-5 py-4 text-sm">
          <span class="text-mute">
            手动那步的产物在哪:
            <a
              href={props.releasesUrl}
              rel="noreferrer"
              target="_blank"
              class="ml-1.5 inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline"
            >
              GitHub Releases
              <ArrowRight size={14} aria-hidden />
            </a>
          </span>
          <span class="ml-auto hidden font-mono text-xs text-mute sm:inline">
            {MCP_COMMAND}
          </span>
        </div>
      </div>
    </Section>
  );
}
