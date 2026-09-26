import { describe, expect, it } from 'vitest';
import {
  clampPanelHeight,
  normalizeChromeHeight,
  PANEL_HEIGHT_CEILING,
  PANEL_HEIGHT_DEFAULT,
  PANEL_HEIGHT_MAX,
  PANEL_HEIGHT_MIN,
  PANEL_HEIGHT_SLACK,
  PANEL_RESIZE_STEP,
  UI_CHROME_DEFAULT,
} from '../panel';

/**
 * 面板高度夹取的不变式。
 *
 * 为什么值得守:这条曾经坏过,而且是**静默**坏 —— `PANEL_HEIGHT_MAX` 一度同时
 * 当「建议收缩点」与「内容截断点」用,内容真超过 640 时高度被砍到 640,而
 * `html, body` 的 `overflow: hidden`(为断宽度重排回环而留,不能撤)又不给滚动条,
 * 超出部分直接消失。症状是「面板整体好像被截断了」,根因却在夹取函数里 ——
 * 查的人会先怀疑布局,而布局是对的。
 *
 * 所以把那条边界钉死:**夹取是为了防荒唐值,不是为了裁剪内容**。
 */
describe('面板高度夹取', () => {
  it('内容超过建议收缩点时,不把它砍到建议值', () => {
    // 812 是这次实际坏掉的量级(内容高度 vs 640 上限)
    const requested = clampPanelHeight(812);
    expect(
      requested,
      `夹取把 812 砍成了 ${requested}:内容超出 ${PANEL_HEIGHT_MAX} 时该让窗口继续长,` +
        '由根元素滚动承担多出来的部分,不能靠截断。',
    ).toBeGreaterThan(PANEL_HEIGHT_MAX);
    expect(requested).toBeLessThanOrEqual(PANEL_HEIGHT_CEILING);
  });

  it('仍然守住硬边界(防的是荒唐值,不是内容)', () => {
    expect(clampPanelHeight(999_999)).toBe(PANEL_HEIGHT_CEILING);
  });

  it('下限照旧:内容再矮也不低于最小可用高度', () => {
    expect(clampPanelHeight(0)).toBe(PANEL_HEIGHT_MIN);
    expect(clampPanelHeight(-100)).toBe(PANEL_HEIGHT_MIN);
  });

  it('向上取整:请求高度绝不小于内容高度', () => {
    // 四舍五入会给出比内容矮的值,那正是「窗口比内容矮 → 长滚动条 → 重排」回环的起点
    expect(clampPanelHeight(344.4)).toBe(345);
    expect(clampPanelHeight(344.4)).toBeGreaterThanOrEqual(344.4);
  });

  it('非有限值退回默认高度,不把 NaN / Infinity 递给宿主', () => {
    // Infinity 也走 `Number.isFinite` 分支:无穷大的请求是无意义的,
    // 退回默认高度比夹到硬边界更安全 —— 后者会让宿主真的去开一个 1200 的窗口
    expect(clampPanelHeight(Number.NaN)).toBe(PANEL_HEIGHT_DEFAULT);
    expect(clampPanelHeight(Number.POSITIVE_INFINITY)).toBe(
      PANEL_HEIGHT_DEFAULT,
    );
  });

  it('上限与建议值是两个不同的概念', () => {
    expect(
      PANEL_HEIGHT_CEILING,
      '硬边界必须明显高于建议收缩点,否则它们实际是同一个数 —— 又回到截断。',
    ).toBeGreaterThan(PANEL_HEIGHT_MAX);
  });
});

/**
 * 收敛性:这才是「测量 → 夹取 → 回写窗口 → 再测量」这条环路的真正约束。
 *
 * 用纯函数复刻 `PanelHeightSync.measure()` + `push()`(判约束 → 吸附 → 取大 →
 * 夹取 → 阈值),逐轮迭代到不再发送为止,断言两件事:
 * ① **不动点存在且就是内容高度**(不震荡、不半档漂移);
 * ② **不会再收敛到一个比内容矮的值** —— 那正是截断的另一种写法。
 *
 * `windowOf` 复刻真实 DOM:`scrollHeight` 报 `max(content, win)`(它至少有窗口
 * 那么久),`rect` 报 `min(content, win)`(被窗口压住时只剩窗口高)。
 *
 * **两个曾被写坏的反例都留在这里当护栏**,它们的形状必须失败:
 * - 只看 `rect` → 内容超限时自锁在窗口高(截断);
 * - 无条件 `max(rect, scrollHeight)` + `SLACK` → 窗口装得下内容后 `max` 退化成
 *   窗口自身的镜像,每轮被 `SLACK` 推高一档,跑满 12 轮不收敛(runaway)。
 * 故 `converge` 必须收敛在 **≤3 轮** 内:正常应当 1–2 轮。
 */
function converge(windowOf: (h: number) => number, chrome = 0) {
  let sent = -1;
  // 窗口的**外框**是这份模型里的变量:内容区拿到的是「外框 − 装饰高」。
  // 传 chrome = 0 时退化成 0014 的形状(外框即内容区),那正是缺省路径。
  let win = PANEL_HEIGHT_DEFAULT;
  const rounds: number[] = [];
  for (let i = 0; i < 12; i++) {
    const contentWin = Math.max(0, win - chrome);
    const rect = Math.min(windowOf(contentWin), contentWin);
    const scroll = Math.max(windowOf(contentWin), contentWin);
    const constrained = scroll > rect;
    const raw =
      Math.ceil(constrained ? scroll : rect) +
      (constrained ? PANEL_HEIGHT_SLACK : 0) +
      chrome;
    const snapped = Math.ceil(raw / PANEL_RESIZE_STEP) * PANEL_RESIZE_STEP;
    const height = clampPanelHeight(snapped);
    rounds.push(height);
    if (Math.abs(height - sent) < PANEL_RESIZE_STEP) break;
    sent = height;
    win = height;
  }
  return { sent, rounds, win };
}

/** 根元素自然高度:窗口装得下就是内容高,装不下就被压到窗口高 */
const scrollHeightOf =
  (content: number) =>
  (win: number): number =>
    Math.max(content, win);

describe('高度环路的收敛性', () => {
  it('内容超窗口时收敛到内容高度,不卡在窗口高度(旧 bug 的形状)', () => {
    const { sent } = converge(scrollHeightOf(812));
    expect(
      sent,
      '收敛值仍等于初始窗口高度 —— 说明测量又变回「读布局框」了,内容超限时会长不上去。',
    ).toBeGreaterThan(PANEL_HEIGHT_DEFAULT);
    expect(sent).toBeGreaterThanOrEqual(812);
  });

  it('收敛到的是不动点:再跑一轮不再发送', () => {
    const { sent, rounds } = converge(scrollHeightOf(812));
    // 末轮高度与已发送值同档 → 判据成立 → 停止
    const last = rounds.at(-1) ?? Number.NaN;
    expect(Math.abs(last - sent)).toBeLessThan(PANEL_RESIZE_STEP);
    expect(
      rounds.length,
      `跑了 ${rounds.length} 轮才停 —— 只要还带着无条件 SLACK,窗口装下内容后 ` +
        '每一轮都会被推高一档,永不收敛。',
    ).toBeLessThan(4);
  });

  it('内容变矮再变高,能回到原值(无漂移)', () => {
    const tall = converge(scrollHeightOf(668)).sent;
    const short = converge(scrollHeightOf(500)).sent;
    const back = converge(scrollHeightOf(668)).sent;
    expect(short).toBeLessThan(tall);
    expect(back).toBe(tall);
  });

  it('内容恰好落在吸附网格上时也不多抬一档', () => {
    // 520 + SLACK 会变成 528,吃掉一整档;约束判据成立时才是该加 SLACK 的场合
    const { sent } = converge(scrollHeightOf(520));
    expect(sent).toBe(PANEL_HEIGHT_DEFAULT);
  });
});

/**
 * 宿主窗口装饰高(0028)。
 *
 * 为什么值得守:`ui.resize(width, height)` 的 `height` 在三个平台都是**外框**高度,
 * 外框里含着宿主自绘的标题栏(Figma / jsDesign / MasterGo 的 typings 同签名同语义)。
 * 只把内容高度发出去,内容区就永远少掉装饰那一截;而根元素有 `overflow-y-auto`
 * (0014 修订),少掉的部分**不报错、只是看不见** —— 症状是「底部被裁了」,
 * 查的人会先去怀疑布局,而布局是对的(同本文件开头那条截断 bug 的坏法)。
 */
describe('宿主装饰高', () => {
  it('窗口请求 = 内容高 + 装饰高,内容区恰好装下内容', () => {
    const chrome = 38;
    const content = 812;
    const { sent } = converge(scrollHeightOf(content), chrome);
    // 外框减掉装饰后必须装得下内容 —— 否则就是被裁
    expect(
      sent - chrome,
      `请求外框 ${sent} 减掉装饰 ${chrome} 只剩 ${sent - chrome},装不下内容 ${content}:` +
        '说明测量侧漏加了装饰高,内容区会被裁掉标题栏那一截。',
    ).toBeGreaterThanOrEqual(content);
  });

  it('装饰高缺省为 0 时退化成 0014 的原公式', () => {
    // 缺省路径(旧 code 产物配新 UI)不能因为多了这个参数而改变行为
    const noChrome = converge(scrollHeightOf(812)).sent;
    const explicitZero = converge(scrollHeightOf(812), 0).sent;
    expect(explicitZero).toBe(noChrome);
  });

  it('装饰高不影响收敛性:仍然 ≤3 轮停下', () => {
    const { rounds } = converge(scrollHeightOf(600), 38);
    expect(
      rounds.length,
      `带着装饰高跑了 ${rounds.length} 轮才停 —— 装饰高是常量,不该参与收敛判据,` +
        '出现多轮说明它被当成了随窗口变化的量。',
    ).toBeLessThan(4);
  });

  it('不可信的装饰高一律收成 0,不发出荒唐请求', () => {
    // 宿主给 undefined / NaN / 负数 / 超大值时都得收住(见 normalizeChromeHeight)。
    // 收成 0 = 不补偿:三平台里只有 MG 有真源,编个数字冒充事实比差几像素更糟
    expect(normalizeChromeHeight(undefined)).toBe(UI_CHROME_DEFAULT);
    expect(normalizeChromeHeight(Number.NaN)).toBe(UI_CHROME_DEFAULT);
    expect(normalizeChromeHeight(-5)).toBe(UI_CHROME_DEFAULT);
    expect(normalizeChromeHeight(PANEL_HEIGHT_CEILING)).toBe(UI_CHROME_DEFAULT);
    // 可信的值原样通过 —— 0 与正数都是宿主说的实话
    expect(normalizeChromeHeight(0)).toBe(0);
    expect(normalizeChromeHeight(38)).toBe(38);
  });

  it('缺省值就是不补偿:没有真源的平台与改前行为一致', () => {
    // Figma / jsDesign 的 typings 无 headerHeight,适配器不实现该方法 →
    // ui_env 带 0 → 请求公式退化成 0014 的形状。这条是「不拿猜测冒充事实」的守卫
    expect(UI_CHROME_DEFAULT).toBe(0);
    expect(normalizeChromeHeight(undefined)).toBe(UI_CHROME_DEFAULT);
  });
});
