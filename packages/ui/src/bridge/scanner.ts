import {
  MAX_SCAN_INTERVAL_MS,
  SCAN_INTERVAL_MS,
  WS_HANDSHAKE_TIMEOUT_MS,
} from 'text-to-design-shared';

/**
 * 单次尝试的兜底上限:握手超时 + 余量。
 * 超过它仍停在 running,说明这一次 run 已经失控,必须强行复位 —— 否则
 * `running` 永久为 true,后续所有重试都被早退挡掉,面板再也回不来。
 */
const RUN_WATCHDOG_MS = WS_HANDSHAKE_TIMEOUT_MS + 3_000;

export interface ScanDeps {
  isConnected: () => boolean;
  /** 通道已被顶替:此时**必须**停止扫描,否则两个面板会互相顶替形成拉锯 */
  isSuperseded: () => boolean;
  open: () => Promise<boolean>;
}

/** 单端口扫描:未连接时按指数退避重试(1s→2s→…→封顶 10s),连上即停并重置 */
export class Scanner {
  private scanTimer: number | undefined;
  private running = false;
  private retryMs = SCAN_INTERVAL_MS;
  private deps: ScanDeps;

  constructor(deps: ScanDeps) {
    this.deps = deps;
  }

  /** 幂等启动:已连/已排队/已被顶替都不再叠加定时器 */
  start(): void {
    if (!this.canScan()) return;
    if (this.scanTimer) return;
    this.scanTimer = window.setTimeout(() => void this.run(), this.retryMs);
  }

  stop(): void {
    clearTimeout(this.scanTimer);
    this.scanTimer = undefined;
  }

  refresh(): void {
    if (this.deps.isConnected()) {
      this.stop();
      this.retryMs = SCAN_INTERVAL_MS;
    } else {
      this.start();
    }
  }

  /** 立即重试一次并重置退避(手动「重试」/首次连接用) */
  connect(): void {
    this.retryMs = SCAN_INTERVAL_MS;
    this.start();
    void this.run();
  }

  abort(): void {
    this.stop();
    this.running = false;
    this.retryMs = SCAN_INTERVAL_MS;
  }

  private canScan(): boolean {
    return !this.deps.isConnected() && !this.deps.isSuperseded();
  }

  private async run(): Promise<void> {
    if (this.running || !this.canScan()) return;
    this.running = true;
    // 看门狗:open() 侧已有握手超时,这里再兜一层 —— 一旦某次 run 失控,
    // `running` 卡住会让重连循环永久静默(比报错隐蔽得多)
    const watchdog = window.setTimeout(() => {
      if (!this.running) return;
      this.running = false;
      this.scheduleNext();
    }, RUN_WATCHDOG_MS);
    try {
      const ok = await this.deps.open();
      if (ok) {
        this.stop();
        this.retryMs = SCAN_INTERVAL_MS;
      } else {
        this.scheduleNext();
      }
    } catch {
      this.scheduleNext();
    } finally {
      clearTimeout(watchdog);
      this.running = false;
    }
  }

  private scheduleNext(): void {
    if (!this.canScan()) return;
    this.stop();
    this.retryMs = Math.min(this.retryMs * 2, MAX_SCAN_INTERVAL_MS);
    this.scanTimer = window.setTimeout(() => void this.run(), this.retryMs);
  }
}
