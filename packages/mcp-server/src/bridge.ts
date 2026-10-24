import type {
  ActivityPhase,
  ActivityPushFrame,
  ConsentPushFrame,
  LogLevel,
  ServerPush,
  VersionPushFrame,
} from 'text-to-design-shared';
import { isConsentSetFrame } from 'text-to-design-shared';
import { BridgeError } from './core/bridge-error';
import { log, warn } from './logger';
import type { PluginMethod, RequestOptions } from './pending';
import { PendingManager } from './pending';
import { currentClient } from './platform-state';
import { Transport } from './transport';

/** 离线日志环形缓冲容量:插件不在线期间先入队,上线按入队顺序回放一次 */
const OFFLINE_LOG_RING = 200;

/** 门面:组合传输层与请求关联层,对外 API 不变 */
export class Bridge {
  private transport = new Transport();
  private pending: PendingManager;
  /** 离线期间攒下的日志(旧→新),上线回放后清空 */
  private logRing: ServerPush[] = [];

  /** 插件连接状态变化(true=已连上,false=断开),用于日志/状态推送与目录同步 */
  onConnectionChange: ((connected: boolean) => void) | null = null;

  /**
   * 面板刚连上(每次新连接一次)。
   *
   * 单独开一个钩子而不是复用 `onConnectionChange`:那个槽已被 `index.ts` 用来刷
   * 平台状态,是**单槽赋值**,再赋一次就是静默顶替。版本提示要的是「面板一打开
   * 就立刻拿到结论」,不能等下一次心跳(见 0038 变更 2026-10-10)。
   */
  onPluginConnect: (() => void) | null = null;

  /**
   * 面板送来的上报同意选择(旁路帧,见 shared/consent-channel.ts)。
   * 持久化与回推由装配层(run.ts)接,桥只管分流。
   */
  onConsentSet: ((granted: boolean) => void) | null = null;

  constructor() {
    this.pending = new PendingManager((text, binary) => {
      this.transport.send(text);
      if (binary) this.transport.send(binary);
    });
    this.transport.onMessage = (raw, isBinary) => {
      if (isBinary) {
        this.pending.onBinary(raw);
        return;
      }
      // consent_set 在请求/响应协议之外,先于 pending 分流;其余文本帧原样交
      // pending.onText(会再解析一次 —— 消息频率是工具调用级,不值得为此改协议层)
      try {
        const parsed: unknown = JSON.parse(raw.toString());
        if (isConsentSetFrame(parsed)) {
          this.onConsentSet?.(parsed.granted);
          return;
        }
      } catch {
        // 解析失败交 pending.onText 统一告警,这里不重复报
      }
      this.pending.onText(raw);
    };
    this.transport.onConnect = () => {
      // 先回放离线日志,再广播连接状态变化:随后的「连接状态变化: 插件上线」
      // 会排在历史之后,面板时间线不倒挂
      this.replayLogs();
      this.onPluginConnect?.();
      this.onConnectionChange?.(true);
    };
    this.transport.onDisconnect = (err) => {
      this.pending.rejectAll(err);
      this.onConnectionChange?.(false);
    };
  }

  get port(): number {
    return this.transport.port;
  }

  start(port: number): Promise<void> {
    return this.transport.start(port);
  }

  stop(): void {
    this.pending.clear();
    this.logRing = [];
    this.transport.stop();
  }

  get isConnected(): boolean {
    return this.transport.isConnected;
  }

  request(
    method: PluginMethod,
    params: unknown,
    opts: RequestOptions = {},
  ): Promise<unknown> {
    if (!this.transport.isConnected) {
      warn(`请求被拒(插件未连接): ${method}`);
      return Promise.reject(
        new BridgeError(
          'not_connected',
          `${currentClient().runtime} 插件未连接。请先在${currentClient().label}中运行该插件。`,
        ),
      );
    }
    return this.pending.request(method, params, opts);
  }

  /** 把一条 daemon 日志发给插件 UI:在线直推,离线进环形缓冲待上线回放 */
  notifyLog(level: LogLevel, line: string): void {
    const push: ServerPush = { type: 'log', level, line };
    if (!this.transport.isConnected) {
      if (this.logRing.length >= OFFLINE_LOG_RING) this.logRing.shift();
      this.logRing.push(push);
      return;
    }
    this.sendLogPush(push);
  }

  /**
   * 把 npm 最新版本推给面板(见 0038)。
   *
   * 离线时**直接丢弃,不进环形缓冲**:版本结论不是日志,回放一条几分钟前的结论
   * 没有意义 —— 面板连上后下一个心跳周期就会拿到新的;而排队的旧结论一旦比缓存
   * 还旧,反而会给出错的升级建议。
   */
  pushVersion(frame: VersionPushFrame): void {
    if (!this.transport.isConnected) return;
    try {
      this.transport.sendPush(JSON.stringify(frame));
    } catch (e) {
      warn(`版本推送失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * 把一次 tools/call 的相位推给面板(最小化态的宠物靠它动)。
   *
   * 离线**直接丢弃**,不进 `logRing`:回放一条几十秒前的「正在跑」会让面板显示一个
   * 早已结束的动作,比不推更糟(同 pushVersion 的理由)。
   *
   * 推送失败只留 warning:它连的是「给人看的装饰」,不能让工具调用因为一个动画挂掉。
   */
  notifyActivity(phase: ActivityPhase, tool?: string): void {
    if (!this.transport.isConnected) return;
    const frame: ActivityPushFrame =
      tool == null
        ? { type: 'activity', phase }
        : { type: 'activity', phase, tool };
    try {
      this.transport.sendPush(JSON.stringify(frame));
    } catch (e) {
      warn(`活动推送失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * 把上报同意状态推给面板(面板连上时 + 用户改定后的回执)。
   * 离线直接丢弃:重连时 onPluginConnect 会再推一次。
   */
  pushConsent(frame: ConsentPushFrame): void {
    if (!this.transport.isConnected) return;
    try {
      this.transport.sendPush(JSON.stringify(frame));
    } catch (e) {
      warn(`同意状态推送失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** 上线回放:按入队顺序补发离线日志(只补一次,发送失败不重试) */
  private replayLogs(): void {
    if (this.logRing.length === 0) return;
    const batch = this.logRing;
    this.logRing = [];
    log(`回放离线日志 ${batch.length} 条`);
    for (const push of batch) this.sendLogPush(push);
  }

  private sendLogPush(push: ServerPush): void {
    try {
      this.transport.sendPush(JSON.stringify(push));
    } catch (e) {
      // 推送失败不影响主流程,但需留痕:否则面板静默丢日志无从排查
      warn(`日志推送失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
