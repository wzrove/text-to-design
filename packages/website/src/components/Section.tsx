import type { JSX, ParentProps } from 'solid-js';
import { Show } from 'solid-js';

type Props = {
  index: string;
  title: string;
  lead?: string;
  id?: string;
  class?: string;
  headerExtra?: JSX.Element;
};

export default function Section(props: ParentProps<Props>) {
  return (
    <section
      id={props.id}
      class={
        'scroll-mt-24 border-t border-line/70 py-20 sm:py-24 ' +
        (props.class ?? '')
      }
    >
      <div class="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div data-reveal="up" class="max-w-2xl">
            <p class="mono-label">{props.index}</p>
            <h2 class="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              {props.title}
            </h2>
            <Show when={props.lead}>
              <p class="mt-3 text-[15px] leading-relaxed text-mute">
                {props.lead}
              </p>
            </Show>
          </div>
          {props.headerExtra}
        </div>
        {props.children}
      </div>
    </section>
  );
}
