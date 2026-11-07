import type { Client } from '@modelcontextprotocol/client';
import type {
  RequestOptions,
  ServerContext,
  ServerNotification,
} from '@modelcontextprotocol/server';
import {
  PROTOCOL_VERSION_META_KEY,
  SERVER_INFO_META_KEY,
  SUBSCRIPTION_ID_META_KEY,
} from '@modelcontextprotocol/server';
import { BATCH_TIMEOUT_MS } from '../config';
import { warn } from '../logger';

export type UpstreamCall = <T>(
  fn: (client: Client) => Promise<T>,
  options?: { replay?: boolean },
) => Promise<T>;

export function serializeSync(sync: () => Promise<void>): () => Promise<void> {
  let pending = Promise.resolve();
  return () => {
    const next = pending.catch(() => {}).then(sync);
    pending = next;
    return next;
  };
}

export function proxyRequestOptions(ctx: ServerContext): RequestOptions {
  const progressToken = ctx.mcpReq._meta?.progressToken;
  return {
    signal: ctx.mcpReq.signal,
    timeout: BATCH_TIMEOUT_MS + 5_000,
    ...(progressToken == null
      ? {}
      : {
          onprogress: (progress) => {
            void ctx.mcpReq
              .notify({
                method: 'notifications/progress',
                params: { ...progress, progressToken },
              })
              .catch((error) => warn(`转发进度失败: ${String(error)}`));
          },
        }),
  };
}

export function proxyNotification<N extends ServerNotification>(
  notification: N,
): N {
  if (!notification.params?._meta) return notification;
  const {
    [SUBSCRIPTION_ID_META_KEY]: _upstreamId,
    [PROTOCOL_VERSION_META_KEY]: _upstreamVersion,
    [SERVER_INFO_META_KEY]: _upstreamServer,
    ...meta
  } = notification.params._meta;
  return { ...notification, params: { ...notification.params, _meta: meta } };
}
