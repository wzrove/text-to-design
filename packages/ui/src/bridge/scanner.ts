import { MAX_SCAN_INTERVAL_MS, SCAN_INTERVAL_MS } from 'text-to-design-shared';

export interface ScanDeps {
  isConnected: () => boolean;
  isSuperseded: () => boolean;
  open: (showConnecting: boolean) => Promise<boolean>;
}

export class Scanner {
  private enabled = false;
  private scanTimer?: number;
  private attempt?: Promise<boolean>;
  private retryMs = SCAN_INTERVAL_MS;
  private deps: ScanDeps;

  constructor(deps: ScanDeps) {
    this.deps = deps;
  }

  refresh(): void {
    if (!this.canScan()) {
      this.stopTimer();
      return;
    }
    if (this.attempt || this.scanTimer !== undefined) return;
    this.scanTimer = window.setTimeout(() => {
      this.scanTimer = undefined;
      void this.run(false);
    }, this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, MAX_SCAN_INTERVAL_MS);
  }

  connect(): void {
    this.enabled = true;
    this.retryMs = SCAN_INTERVAL_MS;
    this.stopTimer();
    void this.run(true);
  }

  abort(): void {
    this.enabled = false;
    this.stopTimer();
    this.attempt = undefined;
  }

  private stopTimer(): void {
    clearTimeout(this.scanTimer);
    this.scanTimer = undefined;
  }

  private canScan(): boolean {
    return (
      this.enabled && !this.deps.isConnected() && !this.deps.isSuperseded()
    );
  }

  private async run(showConnecting: boolean): Promise<void> {
    if (this.attempt || !this.canScan()) return;
    const attempt = this.deps.open(showConnecting);
    this.attempt = attempt;
    const confirmed = await attempt.catch(() => false);
    if (this.attempt !== attempt) return;
    this.attempt = undefined;
    if (confirmed) this.retryMs = SCAN_INTERVAL_MS;
    this.refresh();
  }
}
