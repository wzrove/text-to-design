import type { McpServer } from '@modelcontextprotocol/server';
import {
  buildNodeReference,
  type CopyRequest,
  type CopyResult,
  copyRequestSchema,
  copyResultSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import type { ToolHandle } from '../core/tool-def';
import { bridgeTool } from '../core/tool-exec';
import type { McpI18n } from '../i18n';

export function executeCopy(
  request: CopyRequest,
  _bridge: Bridge,
  _signal: AbortSignal,
): CopyResult {
  return { text: buildNodeReference(request) };
}

export function registerCopyTools(
  server: McpServer,
  bridge: Bridge,
  i18n: McpI18n,
): ToolHandle[] {
  const copy = bridgeTool({
    name: 'jsd_copy',
    title: '复制节点引用',
    description:
      '按 mode/roles/scope/requestedIds 生成且仅生成一个 jsd:// 节点引用 URL，不读取或拼接设计正文、JSON、职责摘要和上下文。单节点使用 jsd://node/{id}，整组使用 jsd://canvas/selection 加重复 id 参数；后续 design-to-code skill 按链接 IDs 获取详情。UI 与 MCP 调用共用此执行体。',
    inputSchema: copyRequestSchema,
    outputSchema: copyResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (args, bridge_, signal) =>
      executeCopy(copyRequestSchema.parse(args), bridge_, signal),
  });
  return [copy(server, bridge, i18n)];
}
