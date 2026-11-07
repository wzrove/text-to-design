import type { McpServer } from '@modelcontextprotocol/server';
import { MCP_TOOL_GROUPS, MCP_TOOL_GUIDANCE } from 'text-to-design-shared';
import { z } from 'zod';
import type { Bridge } from '../bridge';
import { compactOutputSchema } from '../core/compact-schema';
import {
  isPublicTool,
  registerCapability,
  toolCatalog,
} from '../core/tool-catalog';
import { promptIcon } from '../core/tool-icons';
import type { McpI18n } from '../i18n';

const inputSchema = z
  .object({
    group: z
      .string()
      .optional()
      .describe(`Category: ${Object.keys(MCP_TOOL_GROUPS).join(', ')}`),
    query: z
      .string()
      .max(200)
      .optional()
      .describe(
        'Name, title or description substring; spaces separate search terms',
      ),
    names: z
      .array(z.string().min(1))
      .min(1)
      .max(3)
      .optional()
      .describe('Exact names to inspect full schemas, up to 3'),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(20).default(10),
  })
  .strict()
  .refine(
    (args) =>
      args.names == null ||
      (args.group == null && args.query == null && args.offset === 0),
    'names cannot be combined with group, query or offset',
  );

export function registerDiscoveryTools(
  server: McpServer,
  _bridge: Bridge,
  i18n: McpI18n,
) {
  const text = MCP_TOOL_GUIDANCE[i18n.locale];
  return [
    registerCapability(
      server,
      {
        name: 'jsd_describe_tools',
        title: text.title,
        description: text.description,
        inputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        icons: promptIcon(),
      },
      async (raw) => {
        try {
          const args = inputSchema.parse(raw);
          const catalog = toolCatalog(server);
          if (args.group != null && !Object.hasOwn(MCP_TOOL_GROUPS, args.group))
            throw new Error(`Unknown group: ${args.group}`);
          const terms = (args.query ?? '')
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
          const entries = [...catalog.capabilities.values()].sort((a, b) =>
            a.name.localeCompare(b.name),
          );
          const matched =
            args.names != null
              ? args.names.map((name) => {
                  const entry = catalog.capabilities.get(name);
                  if (entry == null) throw new Error(`Unknown tool: ${name}`);
                  return entry;
                })
              : entries.filter(
                  (entry) =>
                    (args.group == null ||
                      MCP_TOOL_GROUPS[args.group]?.includes(entry.name)) &&
                    terms.every((term) =>
                      `${entry.name} ${entry.title ?? ''} ${entry.description ?? ''}`
                        .toLowerCase()
                        .includes(term),
                    ),
                );
          const selected =
            args.names != null
              ? matched
              : matched.slice(args.offset, args.offset + args.limit);
          const tools = selected.map((entry) => ({
            name: entry.name,
            title: entry.title,
            description:
              args.names == null
                ? entry.description?.slice(0, 240)
                : entry.description,
            annotations: entry.annotations,
            public: isPublicTool(server, entry.name),
            execution: isPublicTool(server, entry.name)
              ? 'direct-or-batch'
              : 'batch',
            ...(args.names == null
              ? {}
              : {
                  inputSchema:
                    entry.inputSchema == null
                      ? { type: 'object', properties: {} }
                      : z.toJSONSchema(entry.inputSchema),
                  outputSchema:
                    entry.outputSchema == null
                      ? undefined
                      : compactOutputSchema(z.toJSONSchema(entry.outputSchema)),
                }),
          }));
          const data = {
            profile: catalog.profile,
            groups: Object.keys(MCP_TOOL_GROUPS),
            total: matched.length,
            nextOffset:
              args.names == null && args.offset + tools.length < matched.length
                ? args.offset + tools.length
                : null,
            tools,
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(data) }],
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
    ),
  ];
}
