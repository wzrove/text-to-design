import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { toNodeHandler } from '@modelcontextprotocol/node';
import {
  completable,
  createMcpHandler,
  InMemoryTransport,
  McpServer,
  ResourceTemplate,
  type ServerEvent,
  SUBSCRIPTION_ID_META_KEY,
} from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createCatalogProxy } from '../daemon/catalog-proxy';
import {
  proxyNotification,
  serializeSync,
  type UpstreamCall,
} from '../daemon/proxy-protocol';

const icons = [{ src: 'data:image/svg+xml,<svg/>', mimeType: 'image/svg+xml' }];

async function withProxy(
  fn: (env: {
    client: Client;
    sync: () => Promise<void>;
    calls: ReturnType<typeof vi.fn>;
    seen: ReturnType<typeof vi.fn>;
    publish: (event: ServerEvent) => void;
    negotiateError?: unknown;
  }) => Promise<void>,
  modern = false,
) {
  const calls = vi.fn();
  const buildOrigin = () => {
    const origin = new McpServer({ name: 'origin', version: '1' });
    origin.registerTool(
      'jsd_echo',
      {
        icons,
        _meta: { source: 'origin' },
        annotations: { readOnlyHint: true },
        inputSchema: z.object({ value: z.string() }),
      },
      (args, ctx) => {
        calls(ctx.mcpReq._meta);
        return { content: [{ type: 'text', text: args.value }] };
      },
    );
    origin.registerTool('jsd_write', { inputSchema: z.object({}) }, () => ({
      content: [],
    }));
    origin.registerTool(
      'jsd_wait',
      { inputSchema: z.object({}), annotations: { readOnlyHint: true } },
      async (_args, ctx) => {
        calls('waiting');
        await new Promise<void>((_resolve, reject) => {
          const cancel = () => {
            calls('cancelled');
            reject(ctx.mcpReq.signal.reason);
          };
          if (ctx.mcpReq.signal.aborted) cancel();
          else
            ctx.mcpReq.signal.addEventListener('abort', cancel, { once: true });
        });
        return { content: [] };
      },
    );
    origin.registerPrompt(
      'recipe',
      {
        icons,
        _meta: { source: 'origin' },
        argsSchema: z.object({
          name: completable(z.string(), (value) =>
            ['FRAME', 'INSTANCE'].filter((s) => s.includes(String(value))),
          ).optional(),
        }),
      },
      ({ name }) => ({
        messages: [
          { role: 'user', content: { type: 'text', text: name ?? 'default' } },
        ],
      }),
    );
    origin.registerResource(
      'cached',
      'jsd://cached',
      {
        icons,
        _meta: { source: 'origin' },
        cacheHint: { ttlMs: 12_345, cacheScope: 'private' },
      },
      () => ({ contents: [{ uri: 'jsd://cached', text: 'cached' }] }),
    );
    origin.registerResource(
      'template',
      new ResourceTemplate('jsd://items/{id}', {
        list: undefined,
        complete: {
          id: (value) => ['alpha', 'beta'].filter((id) => id.includes(value)),
        },
      }),
      { icons, _meta: { source: 'origin' } },
      (uri) => ({ contents: [{ uri: uri.href, text: 'item' }] }),
    );

    return origin;
  };
  const handler = createMcpHandler(buildOrigin);
  const http = createServer(toNodeHandler(handler));
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const port = (http.address() as AddressInfo).port;
  const upstream = new Client(
    { name: 'proxy', version: '1' },
    { versionNegotiation: { mode: 'auto' } },
  );
  const replay = vi.fn();
  const forward: UpstreamCall = (fn, options) => {
    replay(options);
    return fn(upstream);
  };
  const client = new Client(
    { name: 'host', version: '1' },
    modern ? { versionNegotiation: { mode: 'auto' } } : {},
  );
  let downstreamHandler: ReturnType<typeof createMcpHandler> | undefined;
  let downstreamHttp: ReturnType<typeof createServer> | undefined;
  let negotiateError: unknown;
  try {
    await upstream.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/mcp`),
      ),
    );
    const connectedGateway = createCatalogProxy(upstream, forward);
    await connectedGateway.syncAll();
    connectedGateway.wireNotifications(upstream);
    await upstream.listen({ resourcesListChanged: true });
    if (modern) {
      downstreamHandler = createMcpHandler(() => connectedGateway.server);
      downstreamHttp = createServer(toNodeHandler(downstreamHandler));
      await new Promise<void>((resolve) =>
        downstreamHttp?.listen(0, '127.0.0.1', resolve),
      );
      const downstreamPort = (downstreamHttp.address() as AddressInfo).port;
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${downstreamPort}/mcp`),
        ),
      );
      try {
        await client.listen({ toolsListChanged: true });
      } catch (error) {
        negotiateError = error;
      }
    } else {
      const [left, right] = InMemoryTransport.createLinkedPair();
      await connectedGateway.server.connect(right as never);
      await client.connect(left as never);
    }
    // 现代连接下宿主挂在 downstreamHandler 上,通知必须从它的 bus 出去;
    // 发到上游 bus 等于往一条没人订阅的通道里丢事件
    const publish = (event: ServerEvent) =>
      (downstreamHandler ?? handler).bus.publish(event);
    await fn({
      client,
      sync: connectedGateway.syncAll,
      calls: replay,
      seen: calls,
      publish,
      negotiateError,
    });
    await connectedGateway.server.close();
  } finally {
    await client.close();
    await downstreamHandler?.close();
    downstreamHttp?.closeAllConnections();
    if (downstreamHttp)
      await new Promise<void>((resolve) =>
        downstreamHttp?.close(() => resolve()),
      );
    await upstream.close();
    await handler.close();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
}

describe('daemon → proxy → host', () => {
  it('工具、prompt、资源与模板保留图标和元数据', async () => {
    await withProxy(async ({ client }) => {
      const { tools } = await client.listTools();
      const { prompts } = await client.listPrompts();
      const { resources } = await client.listResources();
      const { resourceTemplates } = await client.listResourceTemplates();
      for (const entry of [
        tools.find((t) => t.name === 'jsd_echo'),
        prompts[0],
        resources[0],
        resourceTemplates[0],
      ]) {
        expect(entry?.icons).toEqual(icons);
        expect(entry?._meta).toEqual({ source: 'origin' });
      }
      expect(
        (await client.getPrompt({ name: 'recipe' })).messages[0].content,
      ).toEqual({ type: 'text', text: 'default' });
    });
  });

  it('prompt 与模板补全走上游，保留完整结果', async () => {
    await withProxy(async ({ client }) => {
      expect(client.getServerCapabilities()?.completions).toBeDefined();
      const prompt = await client.complete({
        ref: { type: 'ref/prompt', name: 'recipe' },
        argument: { name: 'name', value: 'INST' },
      });
      expect(prompt.completion.values).toEqual(['INSTANCE']);
      const template = await client.complete({
        ref: { type: 'ref/resource', uri: 'jsd://items/{id}' },
        argument: { name: 'id', value: 'alp' },
      });
      expect(template.completion.values).toEqual(['alpha']);
    });
  });

  it('现代连接保留资源缓存字段，目录仍即时失效', async () => {
    await withProxy(async ({ client }) => {
      const resource = await client.readResource({ uri: 'jsd://cached' });
      expect(resource.ttlMs).toBe(12_345);
      expect(resource.cacheScope).toBe('private');
      expect((await client.listResources()).ttlMs).toBe(0);
    }, true);
  });

  it('工具重放策略按只读、幂等注解决定', async () => {
    await withProxy(async ({ client, calls }) => {
      calls.mockClear();
      await client.callTool({
        name: 'jsd_echo',
        arguments: { value: 'hello' },
      });
      expect(calls.mock.calls.at(-1)?.[0]).toEqual({ replay: true });
      await client.callTool({ name: 'jsd_write', arguments: {} });
      expect(calls.mock.calls.at(-1)?.[0]).toEqual({ replay: false });
    });
  });

  it('请求元数据到达 daemon', async () => {
    await withProxy(async ({ client, seen }) => {
      await client.callTool({
        name: 'jsd_echo',
        arguments: { value: 'hello' },
        _meta: { trace: 'request-1' },
      });
      expect(seen.mock.calls.at(-1)?.[0]).toMatchObject({ trace: 'request-1' });
    });
  });

  it('宿主取消请求会中止上游执行', async () => {
    await withProxy(async ({ client, seen }) => {
      const abort = new AbortController();
      const pending = client
        .callTool({ name: 'jsd_wait', arguments: {} }, { signal: abort.signal })
        .catch((error: unknown) => error);
      await vi.waitFor(() => expect(seen).toHaveBeenCalledWith('waiting'));
      abort.abort();
      await pending;
      await vi.waitFor(() => expect(seen).toHaveBeenCalledWith('cancelled'));
    });
  });

  it('HTTP 订阅事件保留元数据到宿主', async () => {
    // 只认 2026-07-28 一代:变更通知挂在 subscriptions/listen 上,2025 一代的
    // createMcpHandler 是按请求的无状态兜底,没有长连接的 list_changed 通道
    // 事件的元数据要原样到宿主(上游订阅标识除外)。通知走的是
    // 「同步串行队列 → 转发」:假事件的 _meta 里没有上游订阅标识,整条链路都保持原样,
    // 所以同步跑完与否不影响判据
    await withProxy(async ({ client, publish, negotiateError }) => {
      expect(negotiateError).toBeUndefined();
      expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
      const changed = vi.fn();
      client.setNotificationHandler(
        'notifications/resources/list_changed',
        changed,
      );
      await client.listen({ resourcesListChanged: true });
      publish({
        kind: 'resources_list_changed',
        params: { _meta: { revision: 3 } },
      });
      await vi.waitFor(() => expect(changed).toHaveBeenCalled());
      expect(changed.mock.calls.at(-1)?.[0].params).toMatchObject({
        _meta: { revision: 3 },
      });
    }, true);
  });

  it('移除上游订阅标识，保留事件元数据与扩展参数', () => {
    const event = {
      method: 'notifications/resources/updated' as const,
      params: {
        uri: 'jsd://cached',
        _meta: { [SUBSCRIPTION_ID_META_KEY]: 'upstream', revision: 2 },
        reason: 'edited',
      },
    };
    expect(proxyNotification(event).params).toEqual({
      uri: 'jsd://cached',
      _meta: { revision: 2 },
      reason: 'edited',
    });
    expect(event.params._meta[SUBSCRIPTION_ID_META_KEY]).toBe('upstream');
  });

  it('目录同步串行执行，前一次失败不阻塞后续同步', async () => {
    let active = 0;
    let peak = 0;
    let count = 0;
    const sync = serializeSync(async () => {
      active += 1;
      peak = Math.max(peak, active);
      const current = ++count;
      await Promise.resolve();
      active -= 1;
      if (current === 1) throw new Error('first sync failed');
    });
    const results = await Promise.allSettled([sync(), sync(), sync()]);
    expect(peak).toBe(1);
    expect(results.map((result) => result.status)).toEqual([
      'rejected',
      'fulfilled',
      'fulfilled',
    ]);
  });
});
