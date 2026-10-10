import type { gsap as GsapApi } from 'gsap';
import { ArrowRight, Check, Loader, RotateCw, Terminal } from 'lucide-solid';
import {
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js';
import {
  DEMO_TASKS,
  type DemoTask,
  type DemoTaskId,
  MCP_COMMAND,
  PLATFORMS,
} from '../content';
import { onFirstVisible, revealDelay } from '../motion';
import CopyButton from './CopyButton';

const TITLE_CHARS = [...'发布页'];
const STEPS = ['提问', '调用工具', '写入画布'];
/** 一轮演完停在终态的时长,之后自动切下一个任务 */
const HOLD_MS = 2600;

const CHART_BARS = [32, 58, 41, 77, 64, 90];
const CHART_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月'];
const MENU_TITLE_CHARS = [...'山雾咖啡'];
const MENU_ITEMS = [
  { name: '美式', price: '¥12' },
  { name: '拿铁', price: '¥18' },
  { name: '山雾轻乳', price: '¥22' },
  { name: '冷萃', price: '¥16' },
];

type Phase = 'typing' | 'thinking' | 'tool' | 'draw';

const STEP_OF: Record<Phase, number> = {
  typing: 0,
  thinking: 1,
  tool: 1,
  draw: 2,
};

/** 画布作画:每个任务一套时间线,顺序由插入位置决定,不靠 CSS 延迟凑 */
function buildDrawTimeline(
  g: typeof GsapApi,
  root: HTMLElement,
  id: DemoTaskId,
) {
  // biome-ignore lint/style/noNonNullAssertion: 选择器指向本文件渲染的固定标记,缺失即渲染 bug
  const one = (sel: string) => root.querySelector<HTMLElement>(sel)!;
  const many = (sel: string) =>
    Array.from(root.querySelectorAll<HTMLElement>(sel));

  const sweep = one('.demo-sweep');
  const tl = g.timeline({ paused: true, defaults: { ease: 'power2.out' } });

  /** 扫光共用:从左掠到右再淡出 */
  const addSweep = () =>
    tl
      .fromTo(
        sweep,
        { xPercent: -140, opacity: 0.85 },
        { xPercent: 420, duration: 1.9, ease: 'power1.inOut' },
        0,
      )
      .to(sweep, { opacity: 0, duration: 0.4 }, 1.55);

  /** 选中框:画完最后一帧出现 */
  const addSelect = (at: number) =>
    tl.fromTo(
      one('.demo-select'),
      { opacity: 0 },
      { opacity: 1, duration: 0.35 },
      at,
    );

  if (id === 'chart') {
    const bars = many('.draw-bar');
    g.set(bars, { transformOrigin: '50% 100%' });
    g.set(one('.draw-axis'), { transformOrigin: 'left center' });

    tl.fromTo(
      one('.draw-chart'),
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.45 },
      0,
    )
      .fromTo(
        one('.draw-axis'),
        { scaleX: 0, opacity: 1 },
        { scaleX: 1, opacity: 1, duration: 0.4 },
        0.35,
      )
      .fromTo(
        bars,
        { scaleY: 0, opacity: 1 },
        {
          scaleY: 1,
          opacity: 1,
          duration: 0.55,
          stagger: 0.09,
          ease: 'power3.out',
        },
        0.5,
      )
      .fromTo(
        many('.draw-tick'),
        { opacity: 0 },
        { opacity: 1, duration: 0.25, stagger: 0.05 },
        1.05,
      )
      .fromTo(
        one('.draw-peak'),
        { opacity: 0, y: -10, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(2)' },
        1.3,
      );
    addSweep();
    addSelect(1.65);
    return tl;
  }

  if (id === 'menu') {
    tl.fromTo(
      one('.draw-menu'),
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.45 },
      0,
    )
      .fromTo(
        many('.draw-char'),
        { opacity: 0, y: -18, scale: 0.9 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.5,
          ease: 'back.out(2)',
          stagger: 0.16,
        },
        0.32,
      )
      .fromTo(
        many('.draw-row'),
        { opacity: 0, x: -24 },
        { opacity: 1, x: 0, duration: 0.4, stagger: 0.12 },
        0.75,
      )
      .fromTo(
        one('.draw-foot'),
        { opacity: 0 },
        { opacity: 1, duration: 0.35 },
        1.4,
      );
    addSweep();
    addSelect(1.7);
    return tl;
  }

  // 卡片:底盘与骨架线靠 clip-path / scaleX 揭示,但必须显式写 opacity:
  // CSS 兜底把 .draw-item 压在 opacity:0,GSAP 只写它声明的属性,不写就永远不显形
  const lines = many('.draw-line');
  g.set(lines, { transformOrigin: 'left center' });

  tl.fromTo(
    one('.draw-frame'),
    { clipPath: 'inset(0% 100% 0% 0%)', opacity: 1 },
    { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1, duration: 0.62 },
    0,
  )
    .fromTo(
      many('.draw-char'),
      { opacity: 0, y: -18, scale: 0.9 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        ease: 'back.out(2)',
        stagger: 0.16,
      },
      0.42,
    )
    .fromTo(
      lines,
      { scaleX: 0, opacity: 1 },
      { scaleX: 1, opacity: 1, duration: 0.45, stagger: 0.18 },
      1.05,
    )
    .fromTo(
      many('.draw-tag'),
      { opacity: 0, y: -16, scale: 0.92 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        ease: 'back.out(2)',
        stagger: 0.16,
      },
      1.35,
    )
    .fromTo(
      one('.draw-button'),
      { opacity: 0, y: -20, scale: 0.88 },
      { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(2.4)' },
      1.75,
    );
  addSweep();
  addSelect(2.15);

  return tl;
}

export default function Hero(props: { releasesUrl: string; repoUrl: string }) {
  const [typed, setTyped] = createSignal(0);
  const [phase, setPhase] = createSignal<Phase>('typing');
  const [task, setTask] = createSignal<DemoTask>(DEMO_TASKS[0]);
  const step = () => STEP_OF[phase()];
  let demo: HTMLDivElement | undefined;
  let canvas: HTMLDivElement | undefined;
  let tl: ReturnType<typeof GsapApi.timeline> | undefined;
  let gsapMod: typeof GsapApi | undefined;
  let loading: Promise<void> | undefined;

  /** gsap 按需加载:首屏 JS 不为演示动画买单,卡片露出时才拉
   * 只 resolve 加载结果,不回传 timeline —— GSAP 动画自带 then(),
   * 一旦被 async 返回值/promise 解析链接住,await 会等到动画播完才放行
   * timeline 按当前任务在加载完成后现场构建,切换任务后能重建 */
  async function ensureTimeline() {
    if (tl || !canvas) return;
    if (!gsapMod) {
      if (!loading) {
        loading = import('gsap')
          .then((mod) => {
            gsapMod = mod.gsap;
          })
          .catch(() => canvas?.classList.add('is-drawn'));
      }
      await loading;
    }
    if (!tl && canvas && gsapMod) {
      tl = buildDrawTimeline(gsapMod, canvas, task().id);
    }
  }

  let cancelled = false;
  let runId = 0;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let rotate: ReturnType<typeof setTimeout> | undefined;

  function sleep(ms: number) {
    return new Promise<void>((resolve) => {
      pending = setTimeout(resolve, ms);
    });
  }

  /** 任务轮播:本轮演完停一会儿再切下一个;手动切换会让旧计时失效(id 对不上) */
  function scheduleRotate(id: number, delay: number) {
    clearTimeout(rotate);
    rotate = setTimeout(() => {
      if (cancelled || id !== runId) return;
      const idx = DEMO_TASKS.findIndex((t) => t.id === task().id);
      selectTask(DEMO_TASKS[(idx + 1) % DEMO_TASKS.length]);
    }, delay);
  }

  /** 播一遍就停在终态,不再自动循环;重播/切任务由按钮触发 */
  async function play(id: number) {
    const alive = () => !cancelled && id === runId;
    const prompt = task().prompt;
    clearTimeout(rotate);

    // 打字不依赖 gsap:分块加载失败也不能把整段演示冻住
    setTyped(0);
    setPhase('typing');
    tl?.pause(0);

    await sleep(560);
    if (!alive()) return;

    for (let i = 1; i <= prompt.length && alive(); i++) {
      setTyped(i);
      await sleep(i % 6 === 0 ? 110 : 38);
    }
    if (!alive()) return;

    setPhase('thinking');
    await sleep(680);
    if (!alive()) return;

    setPhase('tool');
    await sleep(900);
    if (!alive()) return;

    setPhase('draw');
    await ensureTimeline();
    if (!alive()) return;
    if (tl) {
      tl.restart();
      scheduleRotate(id, tl.duration() * 1000 + HOLD_MS);
    } else {
      canvas?.classList.add('is-drawn');
      scheduleRotate(id, HOLD_MS);
    }
  }

  function replay() {
    clearTimeout(pending);
    runId += 1;
    void play(runId);
  }

  /** 切任务:旧时间线作废,DOM 换血后整段重演 */
  function selectTask(next: DemoTask) {
    if (next.id === task().id) return;
    setTask(next);
    tl?.kill();
    tl = undefined;
    replay();
  }

  onMount(() => {
    void ensureTimeline();

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTyped(task().prompt.length);
      setPhase('draw');
      void ensureTimeline().then(() => tl?.progress(1).pause());
      return;
    }
    if (demo) onFirstVisible(demo, () => void play(runId));
  });

  onCleanup(() => {
    cancelled = true;
    clearTimeout(pending);
    clearTimeout(rotate);
    tl?.kill();
  });

  return (
    <section id="top" class="relative overflow-hidden border-b border-line/70">
      <div
        aria-hidden
        class="grid-bg absolute inset-0 animate-[grid-pan_28s_linear_infinite] opacity-45"
      />
      <div
        aria-hidden
        class="absolute -top-40 left-1/2 h-[420px] w-[820px] animate-[drift_16s_ease-in-out_infinite] rounded-full bg-brand/12 blur-[110px]"
      />

      <div class="relative mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:gap-14 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
        <div>
          <p
            data-reveal="up"
            class="mono-label inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1"
          >
            <Terminal size={13} aria-hidden />
            MCP · 即时设计 / Figma / MasterGo
          </p>

          <h1
            data-reveal="up"
            style={revealDelay(1, 90)}
            class="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl"
          >
            让 AI 在你的
            <span class="text-brand">设计软件</span>
            里动手画图
          </h1>

          <p
            data-reveal="up"
            style={revealDelay(2, 90)}
            class="mt-6 max-w-xl text-[17px] leading-relaxed text-mute"
          >
            text-to-design 把 opencode、Claude 这类 AI
            助手接进画布:读取选中内容、按你的描述画新图形、改样式、导出图片。
            你只管描述,它负责操作。
          </p>

          <div
            data-reveal="up"
            style={revealDelay(3, 90)}
            class="mt-8 flex flex-wrap items-center gap-3"
          >
            <a
              href={props.releasesUrl}
              rel="noreferrer"
              target="_blank"
              class="group inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-ink transition duration-300 hover:-translate-y-0.5 hover:brightness-110"
            >
              下载插件包
              <ArrowRight
                size={16}
                aria-hidden
                class="transition-transform duration-300 group-hover:translate-x-1"
              />
            </a>
            <a
              href={`${props.repoUrl}/blob/main/README.md`}
              rel="noreferrer"
              target="_blank"
              class="inline-flex items-center gap-2 rounded-md border border-line bg-panel px-5 py-2.5 text-sm text-txt transition duration-300 hover:-translate-y-0.5 hover:border-brand/50"
            >
              安装说明
            </a>
          </div>

          <div
            data-reveal="up"
            style={revealDelay(4, 90)}
            class="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2.5"
          >
            <p class="mono-label">支持</p>
            <ul class="flex flex-wrap items-center gap-2">
              <For each={PLATFORMS}>
                {(platform) => (
                  <li class="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs transition-colors duration-300 hover:border-brand/40">
                    <span
                      aria-hidden
                      class="h-1.5 w-1.5 rounded-full bg-brand"
                    />
                    <span class="text-txt">{platform.name}</span>
                    <span class="font-mono text-[10px] text-mute">
                      {platform.latin}
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </div>

          <div
            data-reveal="up"
            style={revealDelay(5, 90)}
            class="mt-10 rounded-lg border border-line bg-panel p-4"
          >
            <p class="mono-label">后台服务 · 一条命令</p>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <code class="font-mono text-sm break-all text-code">
                {MCP_COMMAND}
              </code>
              <CopyButton
                text={MCP_COMMAND}
                label="复制后台服务命令"
                class="ml-auto"
              />
            </div>
          </div>
        </div>

        <div
          ref={demo}
          data-reveal="scale"
          style={revealDelay(2, 90)}
          class="relative order-first lg:order-none"
        >
          <div class="rounded-xl border border-line bg-panel shadow-[var(--shadow-panel)]">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-line px-4 py-3">
              <span class="h-2.5 w-2.5 rounded-full bg-coral/70" />
              <span class="h-2.5 w-2.5 rounded-full bg-brand/60" />
              <span class="mono-label ml-2">AI 会话</span>
              {/** biome-ignore lint/a11y/useSemanticElements: 按钮组无对应语义标签,role=group 已足够 */}
              <div
                role="group"
                aria-label="演示任务"
                class="ml-auto flex items-center gap-1"
              >
                <For each={DEMO_TASKS}>
                  {(t) => (
                    <button
                      type="button"
                      onClick={() => selectTask(t)}
                      aria-pressed={t.id === task().id}
                      class={
                        'rounded border px-2 py-0.5 font-mono text-[10px] transition ' +
                        (t.id === task().id
                          ? 'border-brand/50 bg-brand/10 text-brand'
                          : 'border-line text-mute hover:border-brand/40 hover:text-txt')
                      }
                    >
                      {t.label}
                    </button>
                  )}
                </For>
              </div>
              <span class="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 font-mono text-[10px] text-brand">
                <span class="relative flex h-1.5 w-1.5">
                  <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/70" />
                  <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                </span>
                已连接
              </span>
            </div>

            <div class="space-y-3 px-4 py-4 text-sm">
              <p class="relative rounded-lg bg-raise px-3 py-2.5 leading-relaxed text-txt">
                <span class="sr-only">{task().prompt}</span>
                <span aria-hidden class="invisible">
                  {task().prompt}
                </span>
                <span aria-hidden class="absolute inset-0 px-3 py-2.5">
                  <span classList={{ 'typing-caret': phase() === 'typing' }}>
                    {task().prompt.slice(0, typed())}
                  </span>
                </span>
              </p>

              <p
                class="flex items-center gap-2 font-mono text-xs text-mute transition-opacity duration-300"
                classList={{ 'opacity-0': phase() === 'typing' }}
              >
                <Show
                  when={phase() === 'thinking'}
                  fallback={
                    <>
                      <Check size={13} class="text-brand" aria-hidden />
                      <span classList={{ 'demo-tool': phase() !== 'typing' }}>
                        {task().toolLine}
                      </span>
                    </>
                  }
                >
                  <Loader size={13} class="animate-spin" aria-hidden />
                  <span class="inline-flex items-end gap-1">
                    <span class="h-1 w-1 animate-bounce rounded-full bg-mute" />
                    <span class="h-1 w-1 animate-bounce rounded-full bg-mute [animation-delay:120ms]" />
                    <span class="h-1 w-1 animate-bounce rounded-full bg-mute [animation-delay:240ms]" />
                  </span>
                </Show>
              </p>
            </div>

            <div class="border-t border-line px-4 py-5">
              <div class="flex items-center justify-between gap-3">
                <p class="mono-label">画布</p>
                {/* 流水线进度:先看清走到哪一步,再看产物落进画布 */}
                <ol class="flex flex-1 items-center gap-1.5 font-mono text-[10px]">
                  <For each={STEPS}>
                    {(label, i) => (
                      <li class="flex flex-1 items-center gap-1.5 last:flex-none">
                        <span
                          aria-hidden
                          class={
                            'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border text-[9px] leading-none transition-colors duration-500 ' +
                            (step() > i()
                              ? 'border-brand bg-brand text-ink'
                              : step() === i()
                                ? 'border-brand/70 bg-brand/15 text-brand'
                                : 'border-line text-mute')
                          }
                        >
                          {i() + 1}
                        </span>
                        <span
                          class={
                            'whitespace-nowrap transition-colors duration-500 ' +
                            (step() === i() ? 'text-brand' : 'text-mute')
                          }
                        >
                          {label}
                        </span>
                        <Show when={i() < STEPS.length - 1}>
                          <span
                            aria-hidden
                            class="relative h-[3px] flex-1 overflow-hidden rounded-full bg-line"
                          >
                            <span
                              class="absolute inset-y-0 left-0 rounded-full bg-brand transition-[width] duration-500 ease-soft"
                              style={{
                                width: step() > i() ? '100%' : '0%',
                              }}
                            />
                          </span>
                        </Show>
                      </li>
                    )}
                  </For>
                </ol>
              </div>
              <div
                ref={canvas}
                aria-hidden
                class="demo-canvas grid-bg relative mt-3 flex h-[208px] items-center justify-center rounded-lg border border-line/70 bg-ink p-4"
              >
                <span
                  aria-hidden
                  class="pointer-events-none absolute inset-0 overflow-hidden"
                >
                  <span class="demo-sweep sweep-glow draw-item absolute inset-y-0 left-0 w-1/4" />
                </span>

                <Switch>
                  <Match when={task().id === 'chart'}>
                    <div class="relative w-[240px]">
                      <div class="draw-item draw-chart rounded-lg border border-line bg-raise p-3">
                        <p class="flex items-center justify-between">
                          <span class="mono-label text-[9px]">月度产出</span>
                          <span class="draw-item draw-peak rounded bg-brand/15 px-1.5 font-mono text-[9px] leading-4 text-brand">
                            峰值 90
                          </span>
                        </p>
                        <div class="mt-2 flex h-[76px] items-end gap-1.5">
                          <For each={CHART_BARS}>
                            {(v) => (
                              <div
                                class="draw-item draw-bar flex-1 rounded-t bg-brand/70"
                                style={{ height: `${v}%` }}
                              />
                            )}
                          </For>
                        </div>
                        <div class="draw-item draw-axis mt-2 h-px bg-line" />
                        <div class="mt-1 flex justify-between font-mono text-[8px] leading-3 text-mute">
                          <For each={CHART_LABELS}>
                            {(m) => (
                              <span class="draw-item draw-tick">{m}</span>
                            )}
                          </For>
                        </div>
                      </div>
                      <div class="draw-item demo-select pointer-events-none absolute -inset-2">
                        <span class="absolute -top-[18px] left-0 rounded bg-brand px-1.5 font-mono text-[9px] leading-4 text-ink">
                          {task().sizeTag}
                        </span>
                      </div>
                    </div>
                  </Match>

                  <Match when={task().id === 'menu'}>
                    <div class="relative w-[240px]">
                      <div class="draw-item draw-menu rounded-lg border border-line bg-raise p-3">
                        <p class="flex text-sm font-medium">
                          <For each={MENU_TITLE_CHARS}>
                            {(char) => (
                              <span class="draw-item draw-char">{char}</span>
                            )}
                          </For>
                        </p>
                        <div class="mt-2.5 space-y-2">
                          <For each={MENU_ITEMS}>
                            {(item) => (
                              <div class="draw-item draw-row flex items-baseline gap-2 text-[11px]">
                                <span class="text-txt">{item.name}</span>
                                <span class="flex-1 border-b border-dotted border-line" />
                                <span class="font-mono text-mute">
                                  {item.price}
                                </span>
                              </div>
                            )}
                          </For>
                        </div>
                        <p class="draw-item draw-foot mt-3 flex items-center justify-between font-mono text-[9px] text-mute">
                          <span>扫码点单</span>
                          <span class="inline-block h-4 w-4 rounded-sm border border-line" />
                        </p>
                      </div>
                      <div class="draw-item demo-select pointer-events-none absolute -inset-2">
                        <span class="absolute -top-[18px] left-0 rounded bg-brand px-1.5 font-mono text-[9px] leading-4 text-ink">
                          {task().sizeTag}
                        </span>
                      </div>
                    </div>
                  </Match>

                  <Match when={task().id === 'card'}>
                    <div class="relative w-[240px]">
                      <div class="draw-item draw-frame rounded-lg border border-line bg-raise p-3">
                        <p class="flex text-sm font-medium">
                          <For each={TITLE_CHARS}>
                            {(char) => (
                              <span class="draw-item draw-char">{char}</span>
                            )}
                          </For>
                        </p>
                        <div class="mt-2.5 space-y-1.5">
                          <div class="draw-item draw-line h-1.5 w-full rounded bg-line" />
                          <div class="draw-item draw-line h-1.5 w-4/5 rounded bg-line" />
                        </div>
                        <div class="mt-3 flex items-center justify-between">
                          <div class="flex gap-1.5">
                            <span class="draw-item draw-tag h-4 rounded border border-line px-1.5 font-mono text-[9px] leading-4 text-mute">
                              draft
                            </span>
                            <span class="draw-item draw-tag h-4 rounded border border-line px-1.5 font-mono text-[9px] leading-4 text-mute">
                              v2
                            </span>
                          </div>
                          <span class="draw-item draw-button h-5 rounded bg-brand/85 px-2.5 text-[10px] leading-5 text-ink">
                            发布
                          </span>
                        </div>
                      </div>

                      <div class="draw-item demo-select pointer-events-none absolute -inset-2">
                        <span class="absolute -top-[18px] left-0 rounded bg-brand px-1.5 font-mono text-[9px] leading-4 text-ink">
                          {task().sizeTag}
                        </span>
                      </div>
                    </div>
                  </Match>
                </Switch>
              </div>
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <p class="font-mono text-xs text-mute">
              产物由真实工具面驱动 · 面板显示「已连接」即可开工
            </p>
            <button
              type="button"
              onClick={replay}
              class="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1 font-mono text-xs text-mute transition hover:border-brand/50 hover:text-txt"
            >
              <RotateCw size={13} aria-hidden />
              重播演示
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
