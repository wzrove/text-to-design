import {
  Braces,
  Component,
  Download,
  Eye,
  Layers,
  Paintbrush,
  Square,
  WandSparkles,
} from 'lucide-solid';
import type { JSX } from 'solid-js';
import { CAPABILITIES, TOOLS } from '../content';
import { revealDelay } from '../motion';
import Section from './Section';

const ICONS: Record<string, () => JSX.Element> = {
  Eye: () => <Eye size={18} aria-hidden />,
  Square: () => <Square size={18} aria-hidden />,
  Paintbrush: () => <Paintbrush size={18} aria-hidden />,
  Download: () => <Download size={18} aria-hidden />,
  Component: () => <Component size={18} aria-hidden />,
  Braces: () => <Braces size={18} aria-hidden />,
  Layers: () => <Layers size={18} aria-hidden />,
  WandSparkles: () => <WandSparkles size={18} aria-hidden />,
};

export default function Capabilities() {
  return (
    <Section
      id="capabilities"
      index="01 / 能力"
      title="一个操作对应一个工具"
      lead="没有 op 分发,AI 拿到的是可读的工具名和参数表;能力差异由 jsd_ping 现场报出,不支持的字段会被点名而不是被忽略。"
    >
      <ul class="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {CAPABILITIES.map((item, i) => (
          <li
            data-reveal="up"
            style={revealDelay(i)}
            class="group bg-panel p-5 transition-colors duration-300 hover:bg-raise"
          >
            <span class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-raise text-brand transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
              {ICONS[item.icon]?.()}
            </span>
            <h3 class="mt-4 text-[15px] font-medium">{item.title}</h3>
            <p class="mt-2 text-sm leading-relaxed text-mute">{item.desc}</p>
          </li>
        ))}
      </ul>

      <div
        data-reveal="fade"
        class="mt-10 overflow-hidden rounded-xl border border-line"
      >
        <table class="w-full border-collapse text-left text-sm">
          <caption class="sr-only">工具面摘录</caption>
          <thead class="bg-raise">
            <tr>
              <th
                scope="col"
                class="px-4 py-3 font-mono text-xs font-normal uppercase tracking-[0.18em] text-mute"
              >
                工具
              </th>
              <th
                scope="col"
                class="px-4 py-3 font-mono text-xs font-normal uppercase tracking-[0.18em] text-mute"
              >
                说明
              </th>
            </tr>
          </thead>
          <tbody>
            {TOOLS.map((tool, i) => (
              <tr
                data-reveal="fade"
                style={revealDelay(i, 45)}
                class="border-t border-line/70 transition-colors duration-300 hover:bg-raise/50"
              >
                <td class="whitespace-nowrap px-4 py-3 font-mono text-xs text-code">
                  {tool.name}
                </td>
                <td class="px-4 py-3 text-mute">{tool.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p data-reveal="fade" class="mt-3 text-sm text-mute">
        完整工具清单见仓库 packages/mcp-server/README.md。
      </p>
    </Section>
  );
}
