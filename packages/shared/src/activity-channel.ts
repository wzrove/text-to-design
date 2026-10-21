/**
 * 工具活动提醒的跨侧契约:daemon → 面板 UI 的**推送帧**(不进 `PluginRequest`,
 * 理由同 camera-lock / locale-channel / version-channel:不过 MCP,没有外部调用方)。
 *
 * 为什么需要它:面板此前只有 log 帧与连接 status 帧,没有「模型正在干活」这件事。
 * 最小化态(50px)窗口里只剩一个宠物,它拿不到任何相位信号的话就只是个装饰。而 log
 * 帧顶不上这个位置 —— 它是给人排障的文本流,一行日志与「一次 tools/call 的生命周期」
 * 不是同一种事实,按文本推相位必然误报(一次调用可能一行日志都不落,一行日志也可能
 * 来自后台心跳)。
 *
 * **离线不排队**:回放一条几十秒前的「正在跑」比不推更糟 —— 面板会显示一个早已结束
 * 的动作。与 version 帧同一条纪律(见 bridge.pushVersion),不与 log 帧的环形缓冲共用。
 */

/** 一次工具调用在面板侧的三种可见相位;「待机」不是帧,是**没有帧** */
export type ActivityPhase = 'running' | 'success' | 'error';

/** daemon → UI:某次 tools/call 开始 / 结束 */
export interface ActivityPushFrame {
  type: 'activity';
  phase: ActivityPhase;
  /** 工具名(仅用于日志排障,面板不展示) */
  tool?: string;
}

/**
 * 结果相位在面板上保留多久再沉回待机。
 *
 * 为什么要有沉降期而不是「一帧一闪」:一次成功的 tools/call 常常几毫秒就返回,
 * 帧到达和下一帧几乎同时,不保留就等于没画。1.4s 是「看得见一次点头、又不至于
 * 让连续调用糊成常亮」的折中。
 */
export const ACTIVITY_SETTLE_MS = 1_400;

export function isActivityPushFrame(
  value: unknown,
): value is ActivityPushFrame {
  const m = value as Partial<ActivityPushFrame> | null | undefined;
  return (
    m != null &&
    m.type === 'activity' &&
    (m.phase === 'running' || m.phase === 'success' || m.phase === 'error')
  );
}
