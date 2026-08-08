import {
  McpServer,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/server';
import type { Bridge } from './bridge';
import { SERVER_NAME, SERVER_VERSION } from './config';
import { toolRegistrars } from './tools';

/** 装配 McpServer:注册全部工具(工具实现分散在 tools/*,此处只做编排) */
export function buildServer(bridge: Bridge): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      supportedProtocolVersions: ['2026-07-28', ...SUPPORTED_PROTOCOL_VERSIONS],
    },
  );
  for (const register of toolRegistrars) {
    register(server, bridge);
  }
  return server;
}
