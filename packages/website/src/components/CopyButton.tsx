import { Check, Copy } from 'lucide-solid';
import { createSignal, onCleanup, Show } from 'solid-js';

type Props = {
  text: string;
  label?: string;
  class?: string;
};

export default function CopyButton(props: Props) {
  const [copied, setCopied] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(props.text);
      setCopied(true);
      clearTimeout(timer);
      timer = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  onCleanup(() => clearTimeout(timer));

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={props.label ?? '复制到剪贴板'}
      class={
        'inline-flex items-center gap-1.5 rounded-md border border-line bg-raise px-2.5 py-1 font-mono text-xs text-mute transition hover:border-brand/50 hover:text-txt ' +
        (props.class ?? '')
      }
    >
      <Show when={copied()} fallback={<Copy size={14} aria-hidden />}>
        <Check size={14} class="text-brand" aria-hidden />
      </Show>
      <span>{copied() ? '已复制' : '复制'}</span>
    </button>
  );
}
