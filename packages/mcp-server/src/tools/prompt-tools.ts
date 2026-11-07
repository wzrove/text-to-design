import type {
  GetPromptResult,
  Icon,
  McpServer,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import { registerCapability } from '../core/tool-catalog';
import { promptIcon } from '../core/tool-icons';

export function createPromptRegistrar(server: McpServer) {
  const entries = new Map<
    string,
    {
      name: string;
      title?: string;
      description?: string;
      arguments: { name: string; description?: string; required: boolean }[];
      get: (args: Record<string, string>) => GetPromptResult;
    }
  >();

  function registerPrompt<S extends Record<string, z.ZodType>>(
    name: string,
    config: {
      title?: string;
      description?: string;
      icons?: Icon[];
      argsSchema: z.ZodObject<S>;
    },
    render: (args: z.output<z.ZodObject<S>>) => GetPromptResult,
  ) {
    const handle = server.registerPrompt(name, config, render);
    entries.set(name, {
      name,
      title: config.title,
      description: config.description,
      arguments: Object.entries(config.argsSchema.shape).map(
        ([key, schema]) => ({
          name: key,
          description: schema.description,
          required: !schema.isOptional(),
        }),
      ),
      get: (args) => render(config.argsSchema.strict().parse(args)),
    });
    return handle;
  }

  function registerTools() {
    const annotations = {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    };
    const list = registerCapability(
      server,
      {
        name: 'jsd_list_prompts',
        title: '列出设计配方提示词',
        description:
          '列出 MCP 提示词名称、用途与参数；用 jsd_get_prompt 按名称和参数读取正文。插件离线也可用。',
        inputSchema: z.object({}),
        annotations,
        // 这两个工具绕过 bridgeTool 直接注册,不经过注册期的图标投影,显式给
        icons: promptIcon(),
      },
      async () => {
        const data = {
          prompts: [...entries.values()].map(
            ({ get: _get, ...entry }) => entry,
          ),
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data) }],
          structuredContent: data,
        };
      },
    );
    const getInput = z
      .object({
        name: z.string().describe('提示词名称，如 design-strategy'),
        arguments: z
          .record(z.string(), z.string())
          .optional()
          .describe('提示词参数，值均为字符串'),
      })
      .strict();
    const get = registerCapability(
      server,
      {
        name: 'jsd_get_prompt',
        title: '读取设计配方提示词',
        description:
          '按名称和字符串参数读取 MCP 提示词正文；仅提供操作指引，不执行画布操作。插件离线也可用。',
        inputSchema: getInput,
        annotations,
        icons: promptIcon(),
      },
      async (input) => {
        try {
          const { name, arguments: args } = getInput.parse(input);
          const entry = entries.get(name);
          if (!entry)
            throw new Error(
              `未知提示词:${name}；可用名称:${[...entries.keys()].join(' / ')}`,
            );
          const data = entry.get(args ?? {});
          return {
            content: data.messages.map((message) => message.content),
            structuredContent: data,
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: error instanceof Error ? error.message : String(error),
              },
            ],
          };
        }
      },
    );
    return [list, get].map((handle) =>
      Object.assign(handle, { alwaysEnabled: true }),
    );
  }

  return { registerPrompt, registerTools };
}
