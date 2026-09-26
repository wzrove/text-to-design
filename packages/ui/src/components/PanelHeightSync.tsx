import { createEffect, onCleanup } from 'solid-js';
import {
  clampPanelHeight,
  PANEL_HEIGHT_SLACK,
  PANEL_RESIZE_STEP,
  type UiResizeMessage,
} from 'text-to-design-shared';
import { postToCode } from '../bridge/codeChannel';

/**
 * 面板高度同步:把内容自然高度推给插件 code 侧去改窗口尺寸(0014)。
 *
 * 触发源是 ResizeObserver,不是「选中变化」之类的业务事件 —— 后者会让窗口跟着
 * 每一次画布点选变高变矮(`selectionchange` 是高频的,plugin.ts 里就挂在它上面
 * 做推送),而真正改变内容高度的只有布局本身:连接提示换形态、能力表开合、
 * 列表增删行。换句话说,窗口只在「结构性变化」时动。
 *
 * `floor` 是抽屉开合这类**不体现在流里的**高度需求(见 0015):日志抽屉是 fixed 浮层,
 * 内容高度不因它变化,故这里必须显式读一次 `floor()` 让它成为本 effect 的依赖 ——
 * 否则开抽屉时 ResizeObserver 根本不会响,窗口也就不会跟着抬。
 *
 * **量的是「内容需要多高」,不是「根元素现在多高」** —— 两者在内容超限时不等,
 * 混用会让测量自锁(见下 `measure()` 的注释)。
 */
export default function PanelHeightSync(props: {
  /** 宿主支持 ui.resize 才启用;false 时本组件完全不做事(布局已在 App 侧降级) */
  active: boolean;
  /** 测量对象:面板根元素。自适应布局下它不定高,高度即内容高度 */
  target: () => HTMLElement | undefined;
  /** 额外的窗口高度下限(0 / 缺省 = 只要贴内容);打开态要求的占位由调用方给 */
  floor?: () => number;
  /**
   * 宿主窗口外框里装饰(标题栏)占的高度(0028)。
   *
   * 为什么要进这个组件:`ui.resize` 收的是**外框**高度,而这里量的是**内容**高度,
   * 两者差的就是这一项。少加它的症状是内容区永远被裁掉标题栏那一截,且因为根元素
   * 有 `overflow-y-auto`(0014 修订),裁掉的部分**不报错、只是看不见**。
   */
  chromeHeight?: () => number;
}) {
  createEffect(() => {
    const active = props.active;
    if (!active) return;
    const el = props.target();
    if (!el) return;
    // 老 webview 可能没有 ResizeObserver:静默不发请求即可。布局判定在 App 侧,
    // 与「能不能观测」无关 —— 这里缺席不该把面板降级成另一种布局
    if (typeof ResizeObserver === 'undefined') return;

    // 在 effect 顶读一次即可:它只改 push 的结果,而它自己变了就该重发一次请求
    const floor = props.floor?.() ?? 0;
    /**
     * 装饰高同样在顶读一次。它是宿主窗口的属性、与内容无关,一个实例的生命周期里
     * 只会在 `ui_env` 到达时变一次 —— 那次变化会重建本 effect(依赖函数引用变了),
     * 于是重新读到新值并重发一次请求,不需要在 `push` 里逐帧读。
     */
    const chrome = props.chromeHeight?.() ?? 0;

    /**
     * 内容需要的高度:窗口该长多高。
     *
     * 两个陷阱,先后都踩过:
     *
     * ① **不能只用 `getBoundingClientRect().height`**。它给的是根元素**当前布局
     * 框**的高度,而根元素已被窗口约束。窗口 640、内容需要 812 时它读出 640 →
     * 夹取后仍是 640 → 发 640 → 窗口 640 → 下次还读 640 —— **收敛到错误的不动点,
     * 再也长不上去**(见 0014 变更历史 2026-09-25)。
     *
     * ② **不能无条件 `max(rect, scrollHeight)`**。`scrollHeight` 在内容比窗口矮
     * 时报的是**窗口高**(它至少有这么久),于是它成了窗口自己的镜像 —— 加上
     * `PANEL_HEIGHT_SLACK` 后每轮把窗口推高 8px,**这是无不动点的 runaway 增长**
     * (见 0014 变更历史 2026-09-26)。
     *
     * 正解是拿 `scrollHeight > rect` 当**「窗口把内容压住了」的判据**:被压住才
     * 需要撑开(只有这时 `scrollHeight` 才携带有窗口之外的额外信息),没被压住
     * 时 `rect` 就是内容高、且保留亚像素精度。
     *
     * `SLACK` 同理只在被压住时加 —— 未受约束时它没有要补偿的东西,加了就是
     * 平白抬高一档。
     *
     * 实测(Chrome,视口 200 / 内容 400 / padding 16):受限时 `rect=200` 而
     * `scrollHeight=432`;未受限时两者都是 432 —— 判据的方向由此确定。
     */
    const measure = (): { height: number; constrained: boolean } => {
      const rect = el.getBoundingClientRect().height;
      const scroll = el.scrollHeight;
      return scroll > rect
        ? { height: scroll, constrained: true }
        : { height: rect, constrained: false };
    };

    // -1 保证首帧一定发一次:初始窗口是 PANEL_HEIGHT_DEFAULT,收敛到内容高
    // 这一步必须发生,否则自适应等于没开
    let sent = -1;
    const push = (): void => {
      // 用 measure() 而不是 offsetHeight:后者是取整后的整数,且同样受约束框影响
      const { height: measured, constrained } = measure();
      /**
       * 「内容需要多高」→「窗口该多高」:`ui.resize` 的 `height` 是**外框**高度,
       * 而上面量的是**内容**高度,差额就是宿主自绘的标题栏(0028)。
       *
       * 加在这里而不是加在 code 侧的 `resize` 调用点:测量侧才是「窗口该多高」
       * 这个结论的产地,`sent` 记的必须是最终发出去的那个数 —— 它是收敛判据
       * (下面的吸附不动点靠它)。若在 code 侧再加,`sent` 与实际值就不是同一坐标系,
       * 阈值比较会在边界上反复误判。
       */
      const raw =
        Math.ceil(measured) + (constrained ? PANEL_HEIGHT_SLACK : 0) + chrome;
      // 向上吸附到步长:让「差一点点」的变化落进同一档、不再驱动窗口。
      // 吸附只会让窗口偏高(顶多多出一段同色空白)。
      //
      // 不动点由吸附本身保证:窗 = snap(c) 时,`scroll > rect` 不成立(窗已装得下
      // 内容)→ 量出 rect = snap(c) → snap 幂等 → 与 `sent` 同档 → 停止。
      // `floor` 也一起吸附:它是「至少这么高」的下限,不吸附会往比较里塞一个
      // 不在网格上的值,而 `sent` 记的是发出去的那个数 —— 差半档的抖动就够
      // 骗过下面的阈值判断
      const snapped = Math.ceil(raw / PANEL_RESIZE_STEP) * PANEL_RESIZE_STEP;
      const minHeight =
        Math.ceil(Math.max(floor, 0) / PANEL_RESIZE_STEP) * PANEL_RESIZE_STEP;
      const height = clampPanelHeight(
        Math.max(snapped, minHeight) + (minHeight > 0 ? chrome : 0),
      );
      if (Math.abs(height - sent) < PANEL_RESIZE_STEP) return;
      sent = height;
      const msg: UiResizeMessage = { type: 'ui_resize', height };
      postToCode(msg);
    };

    const observer = new ResizeObserver(push);
    observer.observe(el);
    push();
    onCleanup(() => observer.disconnect());
  });

  return null;
}
