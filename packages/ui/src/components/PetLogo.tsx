import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import type { ActivityPhase } from 'text-to-design-shared';

/** 面板可见的四态:`idle` 不是帧,是「没有在跑的工具」且结果相位的沉降期已过 */
export type PetPhase = ActivityPhase | 'idle';

/**
 * 笔尖锚点 = 笔身最低左端顶点。轨迹取点、抬笔、旋转**全部**以它为原点,
 * 换笔身几何时必须一起改,否则笔会在身上画到别处。
 */
const TIP = { x: 73.5, y: 96.4 };

const DRAW_MS = 1500;
const LIFT_MS = 520;
const CYCLE_MS = DRAW_MS + LIFT_MS;

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t * t;

/** 一笔的落点姿态:p = 轨迹进度,其余是抬笔高度与额外位移/旋转 */
interface PencilPose {
  p: number;
  lift?: number;
  dy?: number;
  rot?: number;
  wob?: boolean;
}

/**
 * 最小化态的那只笔宠物(50px 窗口里唯一的像素)。
 *
 * 形状与动画取自设计稿 ai-pet.html,这里只做两件事:把三态翻译成面板的
 * activity 相位;把「运笔」这段从 rAF 里搬到组件生命周期里(可停、可重入)。
 *
 * 为什么不用 `<img src="logo.svg">`:三态要按 MCP 侧的事实切换,还要画笔轨迹的
 * 长度 —— `<img>` 里的 SVG 拿不到 DOM,页面侧既不能改样式也不能驱动动画。
 *
 * 位移一律写 SVG 用户单位(viewBox 高 113):面板里只有 50px,按 px 写死会让
 * 动作幅度随缩放失真。CSS 段的 `translateY(-8px)` 在 SVG 子元素上就是 8 用户单位。
 */
export default function PetLogo(props: { phase: PetPhase }) {
  let guide!: SVGPathElement;
  let pencil!: SVGGElement;
  let green!: SVGPathElement;
  let check!: SVGPathElement;
  let errMarks: SVGPathElement[] = [];

  const [ready, setReady] = createSignal(false);
  /** 系统开了「减少动态效果」就只画静止帧:rAF 循环不受 CSS 的 reduced-motion 管 */
  const still =
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** 路径长度只在挂载时量一次:每帧再量等于每帧强制回流 */
  let trailLen = 0;
  let checkLen = 0;
  let errLens: number[] = [];

  let raf = 0;
  let phaseStart = 0;
  let cycleStart = 0;
  let lastP = 0;

  const setPencil = ({
    p,
    lift = 0,
    dy = 0,
    rot = 0,
    wob = true,
  }: PencilPose): void => {
    const at = clamp01(p);
    const pt = guide.getPointAtLength(at * trailLen);
    const tilt = wob ? Math.sin(at * Math.PI * 6) * 2 : 0;
    pencil.setAttribute(
      'transform',
      `translate(${pt.x - TIP.x} ${pt.y - TIP.y - lift + dy}) rotate(${tilt + rot} ${TIP.x} ${TIP.y})`,
    );
  };

  /** 复位到「刚起笔」的样子:线全部收进笔尖,笔立在轨迹起点 */
  const resetMarks = (): void => {
    green.style.opacity = '0';
    green.style.strokeDashoffset = String(trailLen);
    check.style.strokeDashoffset = String(checkLen);
    errMarks.forEach((el, i) => {
      el.style.strokeDashoffset = String(errLens[i] ?? 0);
    });
    pencil.style.opacity = '1';
  };

  const tick =
    (phase: ActivityPhase) =>
    (now: number): void => {
      const t = now - phaseStart;

      if (phase === 'running') {
        const local = (now - cycleStart) % CYCLE_MS;
        let p: number;
        let lift = 0;
        let opacity = 1;
        if (local <= DRAW_MS) {
          // 起笔慢 → 运笔快 → 收笔慢
          p = easeInOut(local / DRAW_MS);
        } else {
          // 抬笔回到起点:笔身升起,已画的轨迹同步淡出
          const k = (local - DRAW_MS) / LIFT_MS;
          p = 1 - easeInOut(k);
          lift = Math.sin(Math.PI * k) * 7;
          opacity = 1 - Math.min(1, k * 2);
        }
        lastP = p;
        setPencil({ p, lift });
        green.style.opacity = String(opacity);
        green.style.strokeDashoffset = String(trailLen * (1 - p));
        raf = requestAnimationFrame(tick(phase));
        return;
      }

      if (phase === 'success') {
        const k = clamp01(t / 600);
        setPencil({ p: lastP, lift: easeOut(k) * 22, wob: false });
        pencil.style.opacity = String(1 - clamp01((t - 200) / 400));
        const ck = easeOut(clamp01((t - 150) / 420));
        check.style.strokeDashoffset = String(checkLen * (1 - ck));
        if (t < 900) raf = requestAnimationFrame(tick(phase));
        return;
      }

      const k = clamp01(t / 520);
      setPencil({
        p: lastP,
        dy: easeIn(k) * 16,
        rot: easeIn(k) * 22,
        wob: false,
      });
      pencil.style.opacity = String(1 - k);
      const ek = easeOut(clamp01(t / 260));
      errMarks.forEach((el, i) => {
        el.style.strokeDashoffset = String((errLens[i] ?? 0) * (1 - ek));
      });
      if (t < 620) raf = requestAnimationFrame(tick(phase));
    };

  onMount(() => {
    trailLen = guide.getTotalLength();
    checkLen = check.getTotalLength();
    errLens = errMarks.map((el) => el.getTotalLength());
    green.style.strokeDasharray = String(trailLen);
    check.style.strokeDasharray = String(checkLen);
    errMarks.forEach((el, i) => {
      el.style.strokeDasharray = String(errLens[i] ?? 0);
    });
    resetMarks();
    setReady(true);
  });

  createEffect(() => {
    const phase = props.phase;
    if (!ready()) return;

    cancelAnimationFrame(raf);
    phaseStart = performance.now();
    if (phase === 'running') cycleStart = phaseStart;
    resetMarks();

    if (phase === 'idle') {
      lastP = 0;
      // 待机时笔攥在爪子里:去掉 transform 回到画稿原位,而不是立在落笔点上
      pencil.removeAttribute('transform');
      return;
    }
    if (still) {
      // 关掉动效时笔就摆在爪子里,不要停在某一帧的半空
      pencil.removeAttribute('transform');
      return;
    }

    raf = requestAnimationFrame(tick(phase));
  });

  onCleanup(() => cancelAnimationFrame(raf));

  return (
    <div class={`pet state-${props.phase}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="11 0 98 113"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          {/* 腮红:模糊才像「晕开的红」,硬边圆点看着像贴纸 */}
          <filter id="blush-blur" x="-60%" y="-120%" width="220%" height="340%">
            <feGaussianBlur stdDeviation="2.1" />
          </filter>
          {/* 抚摸时冒的爱心;每个 <use> 外面套一层 <g translate> 定位——
              CSS 动画会覆盖元素自身的 transform,位置必须留在父层 */}
          <path
            id="heart-shape"
            fill="#F76868"
            d="M0 4.6C-4.2 0.6-7-1.6-7-4.8C-7-7.8-3.4-9 0-5.8C3.4-9 7-7.8 7-4.8C7-1.6 4.2 0.6 0 4.6Z"
          />
        </defs>
        {/* 地面阴影 */}
        <ellipse
          id="shadow"
          cx="60"
          cy="106"
          rx="27"
          ry="3.6"
          fill="#0A0D12"
          opacity=".5"
          style="filter:blur(1px)"
        />

        <g class="pet-inner">
          {/* 身体 */}
          <path
            fill-rule="evenodd"
            fill="#F2F6FA"
            d="M99.8285 62.4812C99.8285 55.383 97.3314 48.1539 93.0475 41.8843C95.4742 34.8268 98.2831 24.8294 93.9754 21.7711C89.4089 18.5291 80.5505 23.5035 75.3059 26.9343C70.5544 24.8011 65.3398 23.5715 59.8642 23.5715C54.4107 23.5715 49.2148 24.8174 44.4781 26.9739C39.2418 23.5419 30.3304 18.5158 25.7452 21.7711C21.4068 24.8512 24.2905 34.9779 26.7286 42.0429C22.4134 48.344 19.8921 55.5477 19.8921 62.4812C19.8921 80.959 37.7898 85.8144 59.8642 85.8144C81.9387 85.8144 99.8285 79.5889 99.8285 62.4812Z"
          />
          <path
            fill="#96A3B3"
            d="M50.834 25.0638C51.3909 29.0362 52.5347 37.9158 41.5124 41.572C35.8702 43.4436 36.2527 47.1127 40.0951 48.2589L42.7571 53.5739L45.4191 55.4727C43.4471 56.5301 41.5121 60.1199 36.1884 63.0682C30.8647 66.0164 23.5177 68.2116 20.3072 68.4195C19.6777 62.8122 19.5937 52.6271 26.249 43.4436C28.6982 40.0641 20.3071 25.0639 26.249 22.4745C32.9363 18.3106 42.757 29.4109 50.834 25.0638Z"
          />
          <path
            d="M99.8254 62.4849C99.8254 55.3867 97.3316 48.1577 93.0477 41.8881C95.4744 34.8307 98.2821 24.8312 93.9744 21.7729C89.4079 18.5309 80.5486 23.5027 75.3039 26.9335C70.5524 24.8003 65.3434 23.5718 59.8678 23.5718C54.4143 23.5718 49.2139 24.8133 44.4772 26.9698C39.2408 23.5378 30.3283 18.5176 25.7431 21.7729C21.4047 24.853 24.2862 34.9776 26.7243 42.0426C22.4091 48.3437 19.8921 55.5513 19.8921 62.4849C19.8921 80.9627 37.7934 85.8164 59.8678 85.8164C81.9423 85.8164 99.8254 79.5926 99.8254 62.4849Z"
            stroke="#0A0D12"
            stroke-width="3.634"
          />

          {/* 腮红:只在被抚摸(hover)时显形 */}
          <g id="blush" filter="url(#blush-blur)" fill="#F76868">
            <ellipse cx="34" cy="61" rx="7.4" ry="4" opacity=".55" />
            <ellipse cx="86" cy="59" rx="7.4" ry="4" opacity=".55" />
          </g>

          {/* 嘴:三种形态 */}
          <path
            id="mouth"
            stroke="#0A0D12"
            stroke-width="2.379"
            stroke-linejoin="round"
            stroke-linecap="round"
            d="M57.521 68.8395C58.2981 68.8393 60.4707 67.3047 60.9234 66.3333C61.3527 67.0857 62.6259 68.8395 64.3178 68.8395"
          />
          <path
            id="mouth-happy"
            stroke="#0A0D12"
            stroke-width="2.379"
            stroke-linejoin="round"
            stroke-linecap="round"
            d="M55.2 66.6C57.6 71.4 64.4 71.4 66.8 66.6"
          />
          <path
            id="mouth-sad"
            stroke="#0A0D12"
            stroke-width="2.379"
            stroke-linejoin="round"
            stroke-linecap="round"
            d="M55.6 70.4C58 66.6 64 66.6 66.4 70.4"
          />

          {/* 眼睛:正常 */}
          <g id="normal-eyes">
            <path
              fill="#8AD654"
              d="M40.7359 46.6954C44.5119 46.2999 50.6764 46.3846 52.4458 53.8154C51.3586 54.5434 48.8295 56.2399 44.9059 54.7354C40.9826 53.2309 40.5137 48.5452 40.7359 46.6954Z"
            />
            <path
              stroke="#0A0D12"
              stroke-width="1.817"
              stroke-linecap="round"
              d="M39.356 46.8618C39.7621 46.8076 40.2285 46.7453 40.7386 46.6919M52.7786 55.6824C52.6974 55.0141 52.5866 54.3931 52.4492 53.8164M52.4492 53.8164C51.3621 54.5444 48.8255 56.243 44.9018 54.7385C40.9786 53.234 40.5163 48.5417 40.7386 46.6919M52.4492 53.8164C50.6799 46.3856 44.5145 46.2964 40.7386 46.6919"
            />
            <path
              fill="#0A0D12"
              d="M48.7971 49.489C48.7971 51.1213 47.7341 52.9787 46.6002 52.9787C45.4663 52.9787 44.6968 51.1213 44.6968 49.489C44.6968 47.8567 44.6969 47.0701 46.6002 47.0701C48.5036 47.0701 48.7971 47.8567 48.7971 49.489Z"
            />
            <path
              fill="#8AD654"
              d="M80.8676 46.4149C77.0916 46.0194 70.9271 46.1041 69.1578 53.5349C70.2449 54.2629 72.774 55.9594 76.6976 54.4549C80.6209 52.9504 81.0898 48.2647 80.8676 46.4149Z"
            />
            <path
              stroke="#0A0D12"
              stroke-width="1.817"
              stroke-linecap="round"
              d="M82.2476 46.5813C81.8414 46.5271 81.375 46.4648 80.865 46.4114M68.8249 55.4019C68.9061 54.7335 69.0169 54.1126 69.1543 53.5359M69.1543 53.5359C70.2414 54.2639 72.778 55.9625 76.7017 54.458C80.625 52.9535 81.0872 48.2612 80.865 46.4114M69.1543 53.5359C70.9236 46.1051 77.089 46.0159 80.865 46.4114"
            />
            <path
              fill="#0A0D12"
              d="M72.8059 49.2088C72.8059 50.8411 73.8689 52.6984 75.0028 52.6984C76.1367 52.6984 76.9062 50.8411 76.9062 49.2088C76.9062 47.5765 76.9062 46.7898 75.0028 46.7898C73.0995 46.7898 72.8059 47.5765 72.8059 49.2088Z"
            />
          </g>

          {/* 眼睛:被抚摸时眯成的两道弯 */}
          <g
            id="eyes-happy"
            stroke="#0A0D12"
            stroke-width="2.6"
            stroke-linecap="round"
          >
            <path d="M41 51C43.4 46.2 48.6 46.2 51 51" />
            <path d="M70 51C72.4 46.2 77.6 46.2 80 51" />
          </g>

          {/* 眼睛:X(失败) */}
          <g id="x-eyes">
            <path
              d="M43 47 L49 53 M49 47 L43 53"
              stroke="#0A0D12"
              stroke-width="2.5"
              stroke-linecap="round"
            />
            <path
              d="M72 47 L78 53 M78 47 L72 53"
              stroke="#0A0D12"
              stroke-width="2.5"
              stroke-linecap="round"
            />
          </g>

          {/* 鼻子 */}
          <path
            fill-rule="evenodd"
            fill="#F76868"
            d="M62.6998 60.9209C63.7244 60.6487 64.4111 60.149 64.4111 59.5775C64.4111 58.7152 62.8474 58.0161 60.9184 58.0161C58.9895 58.0161 57.4258 58.7152 57.4258 59.5775C57.4258 60.1487 58.1117 60.6482 59.1354 60.9205C59.1826 61.9118 59.9625 62.7004 60.9176 62.7004C61.8726 62.7004 62.6524 61.9121 62.6998 60.9209Z"
          />

          {/* 爪子 */}
          <circle class="paw l" cx="26.06" cy="80.26" r="9.54" fill="#DCE5EF" />
          <circle class="paw r" cx="94.41" cy="78.38" r="9.54" fill="#DCE5EF" />

          {/* 运笔轨迹:guide 只用来取点,不渲染 */}
          <path
            ref={guide}
            id="guide"
            fill="none"
            stroke="none"
            d="M 42,90 C 48,84 56,96 63,89 S 72,85 76,90"
          />
          <path
            ref={green}
            id="green-line"
            fill="none"
            stroke="#8AD654"
            stroke-width="3.634"
            d="M 42,90 C 48,84 56,96 63,89 S 72,85 76,90"
          />

          {/* 成功打勾 */}
          <path
            ref={check}
            id="check-line"
            fill="none"
            stroke="#8AD654"
            stroke-width="3.634"
            d="M 45,91 L 57,99 L 75,76"
          />

          {/* 失败红叉 */}
          <g id="error-line" stroke="#FF4D4F" stroke-width="3.2" fill="none">
            <path
              ref={(el) => {
                errMarks = [...errMarks, el];
              }}
              d="M 50,84 L 70,98"
            />
            <path
              ref={(el) => {
                errMarks = [...errMarks, el];
              }}
              d="M 70,84 L 50,98"
            />
          </g>

          {/* 画笔 */}
          <g ref={pencil} id="pencil-group">
            <path
              fill-rule="evenodd"
              fill="#B6C2D0"
              d="M73.6472 85.3382L82.7594 90.2908L105.045 49.2875C105.793 47.9118 105.284 46.1904 103.908 45.4427L99.7776 43.1978C98.4019 42.4501 96.6805 42.9592 95.9328 44.3349L73.6472 85.3382ZM73.5214 96.4413L73.3267 86.6374L81.8532 91.2724L73.5214 96.4413Z"
            />
          </g>

          {/* 抚摸时从头顶冒的爱心,三个错开相位(延迟写在行内,免得为一个装饰
              再往全局 CSS 里加三个只在 50px 里存在的类) */}
          <g id="hearts">
            <g transform="translate(43 29) scale(.9)">
              <use class="heart" href="#heart-shape" />
            </g>
            <g transform="translate(60 25) scale(1.05)">
              <use
                class="heart"
                href="#heart-shape"
                style="animation-delay:600ms"
              />
            </g>
            <g transform="translate(77 30) scale(.8)">
              <use
                class="heart"
                href="#heart-shape"
                style="animation-delay:1200ms"
              />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
