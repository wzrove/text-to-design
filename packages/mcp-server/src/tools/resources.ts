import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import type { Bridge } from '../bridge';
import type { ToolHandle } from '../core/registry';

function jsonContents(
  uri: string | URL,
  data: unknown,
): {
  contents: { uri: string; mimeType: string; text: string }[];
} {
  return {
    contents: [
      {
        uri: typeof uri === 'string' ? uri : uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * 只读资源:把画布状态暴露为 MCP resources(模型可直接读取为上下文)。
 * 均为按需实时读取(插件离线时随连接门控自动隐藏)。
 */
export function registerResources(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const selection = server.registerResource(
    'canvas-selection',
    'jsd://canvas/selection',
    {
      title: '画布当前选中',
      description:
        '当前选中节点的序列化树(含直接子节点),实时从插件读取;等价于 jsd_get_selection depth=2',
      mimeType: 'application/json',
    },
    async () => {
      const data = await bridge.request('get_selection', { depth: 2 });
      return jsonContents('jsd://canvas/selection', data);
    },
  );

  const fonts = server.registerResource(
    'fonts',
    'jsd://fonts',
    {
      title: '可用字体列表',
      description: '当前环境可用的字体族列表,实时从插件读取',
      mimeType: 'application/json',
    },
    async () => {
      const data = await bridge.request('list_fonts', {});
      return jsonContents('jsd://fonts', data);
    },
  );

  const styles = server.registerResource(
    'styles',
    'jsd://styles',
    {
      title: '本地样式列表',
      description:
        '当前文档可复用的本地样式(PAINT/TEXT/EFFECT/GRID),含 id/name/type;按名应用样式前先读这里拿准确样式名',
      mimeType: 'application/json',
    },
    async () => {
      const data = await bridge.request('list_styles', {});
      return jsonContents('jsd://styles', data);
    },
  );

  const page = server.registerResource(
    'page',
    'jsd://page',
    {
      title: '当前页结构总览',
      description:
        '当前页顶层节点的轻量摘要(名称/类型/位置/尺寸/子节点数),不递归;从头设计整页前先读这里看页面已有内容',
      mimeType: 'application/json',
    },
    async () => {
      const data = await bridge.request('get_page', {});
      return jsonContents('jsd://page', data);
    },
  );

  const nodeTemplate = server.registerResource(
    'node',
    new ResourceTemplate('jsd://node/{id}', { list: undefined }),
    {
      title: '节点详情',
      description:
        '按 id 读取节点的序列化结构,如 jsd://node/12:3;等价于 jsd_find ids 精确查找',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const rawId = vars.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!id) throw new Error(`缺少节点 id: ${uri.href}`);
      const data = await bridge.request('find', { ids: [id] });
      return jsonContents(uri, data);
    },
  );

  // 资源依赖插件在线,不标 alwaysEnabled → 随连接门控
  return [selection, fonts, styles, page, nodeTemplate];
}
