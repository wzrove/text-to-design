import { fromJsonSchema, type McpServer } from '@modelcontextprotocol/server';
import { MCP_CORE_TOOLS, MCP_LEGACY_TOOLS } from 'text-to-design-shared';
import { z } from 'zod';
import { compactOutputSchema } from './compact-schema';
import type { ToolExecutor, ToolHandle, ToolHints } from './registry';

export type ToolProfile = 'full' | 'compact';

export interface Capability {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: z.ZodType;
  outputSchema?: z.ZodType;
  annotations: ToolHints;
  icons?: readonly {
    src: string;
    mimeType?: string;
    sizes?: string[];
    theme?: 'light' | 'dark';
  }[];
}

interface Catalog {
  profile: ToolProfile;
  capabilities: Map<string, Capability>;
  executors: Map<string, ToolExecutor>;
}

const catalogs = new WeakMap<McpServer, Catalog>();

export function toolCatalog(server: McpServer): Catalog {
  let catalog = catalogs.get(server);
  if (catalog == null) {
    catalog = {
      profile: 'full',
      capabilities: new Map(),
      executors: new Map(),
    };
    catalogs.set(server, catalog);
  }
  return catalog;
}

export function configureToolProfile(
  server: McpServer,
  profile: ToolProfile,
): void {
  if (toolCatalog(server).capabilities.size > 0)
    throw new Error('Tool profile must be configured before registration');
  toolCatalog(server).profile = profile;
}

export function isPublicTool(server: McpServer, name: string): boolean {
  return toolCatalog(server).profile === 'full'
    ? name !== 'jsd_describe_tools'
    : name === 'jsd_describe_tools' || MCP_CORE_TOOLS.includes(name);
}

export function registerCapability(
  server: McpServer,
  capability: Capability,
  execute: ToolExecutor,
): ToolHandle {
  const catalog = toolCatalog(server);
  if (
    catalog.profile === 'compact' &&
    MCP_LEGACY_TOOLS.includes(capability.name)
  ) {
    return { enable() {}, disable() {} };
  }
  catalog.capabilities.set(capability.name, capability);
  catalog.executors.set(capability.name, execute);
  if (!isPublicTool(server, capability.name))
    return { enable() {}, disable() {} };
  const { name, outputSchema, ...config } = capability;
  const projected =
    outputSchema == null
      ? undefined
      : fromJsonSchema(
          compactOutputSchema(z.toJSONSchema(outputSchema)) as never,
        );
  const register = server.registerTool.bind(server) as unknown as (
    name: string,
    config: Record<string, unknown>,
    callback: (...args: unknown[]) => Promise<unknown>,
  ) => ToolHandle;
  return register(
    name,
    { ...config, ...(projected == null ? {} : { outputSchema: projected }) },
    async (...args) => {
      const ctx = (capability.inputSchema == null ? args[0] : args[1]) as
        | { mcpReq?: { signal?: AbortSignal }; signal?: AbortSignal }
        | undefined;
      return execute(
        capability.inputSchema == null
          ? {}
          : ((args[0] ?? {}) as Record<string, unknown>),
        ctx?.mcpReq?.signal ?? ctx?.signal,
      );
    },
  );
}
