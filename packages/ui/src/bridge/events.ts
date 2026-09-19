import type { BridgeEvent } from './types';

export class EventBus {
  private listeners = new Set<(e: BridgeEvent) => void>();

  subscribe(cb: (e: BridgeEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(event: BridgeEvent): void {
    for (const cb of this.listeners) {
      try {
        cb(event);
      } catch {}
    }
  }
}
