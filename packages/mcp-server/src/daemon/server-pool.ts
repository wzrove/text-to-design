import type { McpServer } from '@modelcontextprotocol/server';

/**
 * McpServer 实例池。
 *
 * ## 为什么需要它(2026-11 升级 @modelcontextprotocol/server 2.3.0 起)
 *
 * 2.3.0 收紧连接模型:**一个 `McpServer` 同时只服务一个连接**。daemon 原先的写法是
 * `createMcpHandler(() => (assembled ??= buildServer(bridge)))` —— 工厂返回同一个实例,
 * 于是两次**重叠**的 HTTP 请求会让后者拿到 `500 / -32603`,两个 shim 会话同时 initialize
 * 则 `ALREADY_CONNECTED`。顺序请求仍然可用,所以这类问题在单测里看不见。
 *
 * ## 为什么不改成「每个请求新建一个 server」
 *
 * 装配一次 51.7 ms(53 个工具 schema + i18n 投影,实测见 server.ts)。per-request 新建
 * 会把这段成本加到**每一次** tools/call 上。
 *
 * ## 取法
 *
 * 按**并发槽位**取(调用方传当前在途请求序号,从 0 起):槽位 0 用实例 0,槽位 1 用实例 1……
 * 于是重叠的请求天然落到不同实例上,而顺序请求反复命中同一批实例 —— 装配成本只付
 * 「池子里有几个」那么多次。槽位超过池上限时按取模复用一个实例:宁可退化到旧行为
 * (并发极端时的那一次冲突),也不无限建实例吃内存。
 */

/** 默认池大小:daemon 的实际并发通常是 1–2(单 shim 会话 + 偶尔并行 tools/call) */
export const DEFAULT_POOL_SIZE = 4;

/** 上限:再高只是多付装配成本,并发冲突的概率已可忽略 */
export const DEFAULT_POOL_MAX = 8;

export interface ServerPool {
  /**
   * 取一个可服务当前请求的实例。`slot` 是调用方维护的**在途请求序号**(0 起),
   * 不是并发数上限 —— 超过池上限时按取模复用。
   */
  acquire(slot: number): McpServer;
  /** 预建 `count` 个实例(在 listen 之后调用,把这 51.7 ms 挪出首个请求) */
  warm(count?: number): void;
  /** 已装配的实例数(测试与日志用) */
  readonly size: number;
}

export function createServerPool(
  build: () => McpServer,
  options: { size?: number; max?: number } = {},
): ServerPool {
  const size = Math.max(1, options.size ?? DEFAULT_POOL_SIZE);
  const max = Math.max(size, options.max ?? DEFAULT_POOL_MAX);
  const instances: McpServer[] = [];

  const growTo = (target: number): void => {
    const want = Math.min(Math.max(target, 1), max);
    while (instances.length < want) instances.push(build());
  };

  // 一次性建满默认池:daemon 启动本就是异步的,把这 ~200 ms(4 × 51.7) 花在 listen
  // 之前,比让用户的首个 tools/call 排队等装配划算
  growTo(size);

  return {
    acquire(slot: number): McpServer {
      const index = Math.max(0, Math.trunc(slot));
      growTo(index + 1);
      return instances[index % instances.length];
    },
    warm(count = size): void {
      growTo(count);
    },
    get size(): number {
      return instances.length;
    },
  };
}
