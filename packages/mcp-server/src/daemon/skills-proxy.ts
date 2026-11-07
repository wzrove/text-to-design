import type { Client } from '@modelcontextprotocol/client';
import type { McpServer } from '@modelcontextprotocol/server';
import {
  RESOURCES_DIRECTORY_READ_METHOD,
  SKILLS_EXTENSION_ID,
  SKILLS_GET_METHOD,
  SKILLS_LIST_METHOD,
} from '@modelcontextprotocol/server/ext/skills';
import { z } from 'zod';

export function registerSkillsProxy(
  server: McpServer,
  initialClient: Client,
  withUpstream: <T>(fn: (client: Client) => Promise<T>) => Promise<T>,
): void {
  const capability =
    initialClient.getServerCapabilities()?.extensions?.[SKILLS_EXTENSION_ID];
  if (capability == null) return;

  const pageParams = z.looseObject({ cursor: z.string().optional() });
  const uriParams = z.looseObject({ uri: z.string() });
  // 代理保留扩展结果字段，契约校验仍由上下游 SDK 承担。
  const resultSchema = z.looseObject({});
  const upstream = (
    method: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
  ) =>
    withUpstream((client) =>
      client.request({ method, params }, resultSchema, { signal }),
    );

  server.server.setRequestHandler(
    SKILLS_LIST_METHOD,
    { params: pageParams },
    (params, ctx) => upstream(SKILLS_LIST_METHOD, params, ctx.mcpReq.signal),
  );
  server.server.setRequestHandler(
    SKILLS_GET_METHOD,
    { params: uriParams },
    (params, ctx) => upstream(SKILLS_GET_METHOD, params, ctx.mcpReq.signal),
  );
  if (capability.directoryRead === true) {
    server.server.setRequestHandler(
      RESOURCES_DIRECTORY_READ_METHOD,
      { params: uriParams.extend({ cursor: z.string().optional() }) },
      (params, ctx) =>
        upstream(RESOURCES_DIRECTORY_READ_METHOD, params, ctx.mcpReq.signal),
    );
  }
  server.server.registerCapabilities({
    extensions: { [SKILLS_EXTENSION_ID]: capability },
  });
}
