/**
 * 连接层协议真源:daemon ↔ 插件 UI 共用的端口、握手帧与重连节奏。
 *
 * 为什么单独成模块:同一条链路两侧原本各写各的魔数 —— daemon 里是裸 `30_000`
 * 心跳,UI 里是 `5000` 确认超时 / `1000`、`10000` 重扫退避 / `25000` 转发超时,
 * 端口又只写在 shared 根。改一处漏一处就会出现「UI 先超时判死、daemon 还在等」
 * 这类只在特定时序复现的问题。这里集中登记,两侧只允许引用、不允许再写字面量。
 */

/** 插件面板 ↔ daemon 的 WebSocket 端口(固定;被占即启动失败) */
export const WS_PORT = 47812;

/**
 * daemon → 插件 UI 的连接状态帧(握手 / 心跳 / 顶替三合一)。
 *
 * - `ready`      —— 这条连接是 daemon 认可的插件通道。连上即发一次,之后每
 *                   {@link HEARTBEAT_MS} 重发一次,UI 拿它当「服务确认」源。
 * - `superseded` —— 后到的连接顶替了这条(单通道模型)。收到即应停止自动重连,
 *                   交用户手动夺回;否则两个面板会互相顶替、无限拉锯。
 */
export type ServerStatusFrame = {
  type: 'status';
  state: 'ready' | 'superseded';
  version: string;
};

/** daemon 心跳:周期性重发 ready,兼作 UI 的确认源 */
export const HEARTBEAT_MS = 30_000;

/**
 * 顶替关闭码(WebSocket 私有段 4000-4999)。收到 superseded 帧与收到该关闭码
 * 是同一件事的两条冗余路径:帧可能被中间代理吞掉,关闭码不会。
 */
export const SUPERSEDED_CLOSE_CODE = 4000;

/**
 * 首帧探测延迟:绕开代理层「连接瞬间首条消息易丢」的窗口 ——
 * ws.onopen 后不立刻依赖对端推送,稍后再主动探一次。
 */
export const PROBE_DELAY_MS = 1_000;

/** 握手确认预算:onopen 起算,超过它仍未收到 ready/pong 即判「连上但不通」并重连 */
export const CONFIRM_TIMEOUT_MS = 5_000;

/**
 * WS 握手超时(兜底):从 `new WebSocket()` 起算,超时仍未 onopen 就主动放弃。
 *
 * 这个兜底不能省。没有它,一次「TCP 连上了、但升级帧再也没回来」的悬挂会让
 * `open()` 的 promise **永不落地**,而 UI 的重连循环正是 `await` 它:
 * 一旦悬挂,`Scanner.running` 永久为 true,后续所有重试都被早退挡掉 ——
 * 表现为面板掉线后再也不尝试重连(实测复现:面板掉线后 12 分钟零重连动作),
 * 比直接报错隐蔽得多。
 */
export const WS_HANDSHAKE_TIMEOUT_MS = 8_000;

/** 未连接时的重扫退避:1s 起、每次翻倍、封顶 10s */
export const SCAN_INTERVAL_MS = 1_000;
export const MAX_SCAN_INTERVAL_MS = 10_000;

/**
 * 插件请求超时。不变式:UI 转发侧必须**小于** daemon 侧,保证先由 UI 回超时错误
 * 包、不留孤儿 pending(见 {@link PLUGIN_TIMEOUT_MS})。
 */
export const UI_FORWARD_TIMEOUT_MS = 25_000;
export const PLUGIN_TIMEOUT_MS = 30_000;
