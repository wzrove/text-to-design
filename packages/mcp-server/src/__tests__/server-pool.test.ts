import type { McpServer } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createServerPool } from '../daemon/server-pool';

const build = () => ({ isConnected: () => false }) as McpServer;

describe('server leases', () => {
  it('reuses the released instance while another request remains active', () => {
    const pool = createServerPool(build, { size: 2, max: 2 });
    const a = pool.acquire();
    const b = pool.acquire();
    expect(a?.server).not.toBe(b?.server);
    a?.release();
    const c = pool.acquire();
    expect(c?.server).toBe(a?.server);
    expect(c?.server).not.toBe(b?.server);
  });

  it('rejects saturation instead of sharing a busy instance', () => {
    const pool = createServerPool(build, { size: 1, max: 2 });
    const a = pool.acquire();
    const b = pool.acquire();
    expect(pool.size).toBe(2);
    expect(pool.acquire()).toBeNull();
    b?.release();
    expect(pool.acquire()?.server).toBe(b?.server);
    a?.release();
  });

  it('a repeated release cannot free a newer lease', () => {
    const pool = createServerPool(build, { size: 1, max: 1 });
    const a = pool.acquire();
    a?.release();
    const b = pool.acquire();
    a?.release();
    expect(pool.acquire()).toBeNull();
    b?.release();
    expect(pool.acquire()).not.toBeNull();
  });

  it('does not reassign an instance until SDK disconnection completes', () => {
    let connected = false;
    const pool = createServerPool(
      () => ({ isConnected: () => connected }) as McpServer,
      { size: 1, max: 1 },
    );
    const lease = pool.acquire();
    connected = true;
    lease?.release();
    expect(pool.acquire()).toBeNull();
    connected = false;
    expect(pool.acquire()?.server).toBe(lease?.server);
  });

  it('warm grows within the configured bound', () => {
    const pool = createServerPool(build, { size: 1, max: 3 });
    pool.warm(10);
    expect(pool.size).toBe(3);
    pool.warm(1);
    expect(pool.size).toBe(3);
  });
});
