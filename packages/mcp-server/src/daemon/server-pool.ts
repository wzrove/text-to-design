import type { McpServer } from '@modelcontextprotocol/server';

export const DEFAULT_POOL_SIZE = 4;
export const DEFAULT_POOL_MAX = 8;

export interface ServerLease {
  server: McpServer;
  release(): void;
}

export interface ServerPool {
  acquire(): ServerLease | null;
  warm(count?: number): void;
  readonly size: number;
}

export function createServerPool(
  build: () => McpServer,
  options: { size?: number; max?: number } = {},
): ServerPool {
  const size = Math.max(1, Math.trunc(options.size ?? DEFAULT_POOL_SIZE));
  const max = Math.max(size, Math.trunc(options.max ?? DEFAULT_POOL_MAX));
  const slots: { server: McpServer; busy: boolean }[] = [];
  const growTo = (count: number): void => {
    const target = Math.min(Math.max(1, Math.trunc(count)), max);
    while (slots.length < target) slots.push({ server: build(), busy: false });
  };
  growTo(size);
  return {
    acquire(): ServerLease | null {
      let slot = slots.find(
        (candidate) => !candidate.busy && !candidate.server.isConnected(),
      );
      if (slot == null && slots.length < max) {
        growTo(slots.length + 1);
        slot = slots.at(-1);
      }
      if (slot == null) return null;
      const selected = slot;
      selected.busy = true;
      let released = false;
      return {
        server: selected.server,
        release() {
          if (released) return;
          released = true;
          selected.busy = false;
        },
      };
    },
    warm(count = size) {
      growTo(count);
    },
    get size() {
      return slots.length;
    },
  };
}
