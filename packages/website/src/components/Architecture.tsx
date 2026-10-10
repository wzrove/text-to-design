import { Cpu, Monitor, Server } from 'lucide-solid';
import { revealDelay } from '../motion';
import Section from './Section';

const NODES = [
  {
    icon: Cpu,
    tag: 'AI 助手',
    title: 'opencode / Claude Code / VS Code',
    body: '注册一个 stdio MCP server 即可,不需要为每个平台各配一套。',
  },
  {
    icon: Server,
    tag: '后台服务',
    title: 'text-to-design-mcp',
    body: '常驻 daemon 负责传话:对上是 MCP 工具面,对下是 WebSocket 桥(端口 47812)。装一次,跨平台复用。',
  },
  {
    icon: Monitor,
    tag: '设计软件插件',
    title: 'jsDesign / Figma / MasterGo',
    body: '在画布里真正动手的一端。按平台构建各自产物,导入哪份就操作哪个画布。',
  },
];

export default function Architecture() {
  return (
    <Section
      id="architecture"
      index="02 / 链路"
      title="三段链路,两头各装一次"
      lead="AI 侧只认 MCP,设计软件侧只认插件 manifest,中间那层是本地小服务。任何一段断了,插件面板都会给出明确状态而不是静默失败。"
    >
      <ol class="mt-12 grid gap-4 lg:grid-cols-3">
        {NODES.map((node, i) => (
          <li
            data-reveal="up"
            style={revealDelay(i)}
            class="relative rounded-xl border border-line bg-panel p-5 transition-colors duration-300 hover:border-brand/40"
          >
            <div class="flex items-center gap-2.5">
              <node.icon size={17} class="text-brand" aria-hidden />
              <span class="mono-label">
                {String(i + 1).padStart(2, '0')} · {node.tag}
              </span>
            </div>
            <h3 class="mt-4 font-mono text-sm text-txt">{node.title}</h3>
            <p class="mt-2.5 text-sm leading-relaxed text-mute">{node.body}</p>
          </li>
        ))}
      </ol>

      <p
        data-reveal="fade"
        class="relative mt-6 overflow-hidden rounded-lg border border-line/70 bg-panel/60 px-4 py-3 font-mono text-xs text-mute"
      >
        <span
          aria-hidden
          class="sweep-glow pointer-events-none absolute inset-y-0 left-0 w-1/4 animate-[sweep_5s_ease-in-out_infinite]"
        />
        <span class="relative">
          AI 会话 ⇄ stdio MCP ⇄ daemon(:47820 HTTP / :47812 WS) ⇄ 插件 ⇄
          画布节点
        </span>
      </p>
    </Section>
  );
}
