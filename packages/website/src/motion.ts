import { createSignal, type JSX, onCleanup, onMount } from 'solid-js';

const IN = 'is-in';
const REVEAL = '[data-reveal]';

/** 滚动显现:首屏外元素保持透明,进入视口后由 CSS 动画接管一次即停 */
export function initReveal() {
  const targets = Array.from(document.querySelectorAll<HTMLElement>(REVEAL));
  if (!targets.length) return;

  const mark = (el: Element) => el.classList.add(IN);

  if (!('IntersectionObserver' in window)) {
    targets.forEach(mark);
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        mark(entry.target);
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.08, rootMargin: '0px 0px -8% 0px' },
  );

  targets.forEach((el) => {
    io.observe(el);
  });
  onCleanup(() => io.disconnect());
}

/** 当前处于视口中段的区块 id,供导航高亮(Header 挂回页面时直接用) */
export function createSectionSpy(ids: string[]) {
  const [active, setActive] = createSignal('');

  onMount(() => {
    if (!('IntersectionObserver' in window)) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { threshold: 0, rootMargin: '-45% 0px -45% 0px' },
    );

    const observed = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    observed.forEach((el) => {
      io.observe(el);
    });
    onCleanup(() => io.disconnect());
  });

  return active;
}

/** 页面滚动进度 0→1,驱动顶部进度条 */
export function createScrollProgress() {
  const [progress, setProgress] = createSignal(0);

  onMount(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    onCleanup(() => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    });
  });

  return progress;
}

/** 元素首次进入视口时跑一次,用于启动 Hero 演示这类只播一次的时序 */
export function onFirstVisible(el: Element, run: () => void) {
  if (!('IntersectionObserver' in window)) {
    run();
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.disconnect();
        run();
      }
    },
    { threshold: 0.25 },
  );

  io.observe(el);
  onCleanup(() => io.disconnect());
}

/** 同组元素错峰:配合 index 让卡片依次入场而不是齐刷刷 */
export function revealDelay(index: number, step = 70): JSX.CSSProperties {
  return { '--reveal-delay': `${index * step}ms` };
}
