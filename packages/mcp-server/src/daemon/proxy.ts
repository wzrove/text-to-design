import type { Client } from '@modelcontextprotocol/client';
import {
  fromJsonSchema,
  McpServer,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { HTTP_PORT, SERVER_NAME, SERVER_VERSION } from '../config';

/** shim 模式:本进程 stdio 透传到 daemon 的 HTTP 端点,不启 WS */
export async function serveProxy(client: Client): Promise<void> {
  const { tools } = await client.listTools();
  const stdioHandle = serveStdio(() => {
    const server = new McpServer(
      { name: SERVER_NAME, version: SERVER_VERSION },
      {
        supportedProtocolVersions: [
          '2026-07-28',
          ...SUPPORTED_PROTOCOL_VERSIONS,
        ],
      },
    );
    const register = server.registerTool.bind(server) as unknown as (
      name: string,
      config: {
        description?: string;
        inputSchema?: unknown;
        outputSchema?: unknown;
      },
      cb: (args: Record<string, unknown>) => Promise<unknown>,
    ) => unknown;
    for (const t of tools) {
      register(
        t.name,
        {
          description: t.description,
          inputSchema: fromJsonSchema(t.inputSchema as never),
          ...(t.outputSchema
            ? { outputSchema: fromJsonSchema(t.outputSchema as never) }
            : {}),
        },
        async (args) => {
          const res = (await client.callTool({
            name: t.name,
            arguments: args,
          })) as {
            content: unknown;
            structuredContent?: unknown;
            isError?: boolean;
          };
          return {
            content: res.content,
            ...(res.structuredContent !== undefined
              ? { structuredContent: res.structuredContent }
              : {}),
            ...(res.isError ? { isError: true } : {}),
          };
        },
      );
    }
    return server;
  });
  process.stderr.write(
    `[text-to-design-mcp] shim 模式: stdio → http://127.0.0.1:${HTTP_PORT}/mcp (共享 daemon)\n`,
  );
  process.on('SIGINT', async () => {
    await stdioHandle.close();
    await client.close();
    process.exit(0);
  });
}
