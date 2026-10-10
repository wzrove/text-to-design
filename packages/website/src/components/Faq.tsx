import { ChevronDown } from 'lucide-solid';
import { FAQS } from '../content';
import { revealDelay } from '../motion';
import Section from './Section';

export default function Faq() {
  return (
    <Section
      id="faq"
      index="05 / 排查"
      title="连不上时先看哪一端"
      lead="多数问题出在「会话没重启」或「插件没在跑」,而不是服务本身。"
      class="pb-24"
    >
      <div class="mt-10 divide-y divide-line/70 overflow-hidden rounded-xl border border-line bg-panel">
        {FAQS.map((item, i) => (
          <details
            data-reveal="up"
            style={revealDelay(i, 60)}
            class="group transition-colors duration-300 hover:bg-raise/40"
          >
            <summary class="flex cursor-pointer list-none items-center gap-4 px-5 py-4 text-[15px] font-medium marker:hidden">
              {item.q}
              <ChevronDown
                size={17}
                aria-hidden
                class="ml-auto shrink-0 text-mute transition-transform duration-300 group-open:rotate-180"
              />
            </summary>
            <p class="reveal-answer px-5 pb-5 text-sm leading-relaxed text-mute">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
