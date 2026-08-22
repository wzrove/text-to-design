import {
  McpServer,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/server';
import type { Bridge } from './bridge';
import { SERVER_NAME, SERVER_VERSION } from './config';
import type { ToolHandle } from './core/registry';
import { log } from './logger';
import { toolRegistrars } from './tools';

/** initialize 时下发给客户端模型的使用纪律(与 AGENTS.md 保持同源) */
const INSTRUCTIONS = `操作设计画布的工具集。调用纪律:
- 新建复杂结构:先用 jsd_create_nodes 平铺创建 Frame/叶子节点,再用 jsd_manage_nodes op=reparent 归组;children 深嵌套易失败。auto-layout 参数(layoutMode/itemSpacing/padding* 等)建完后用 jsd_update_node 单独设置。
- 组件:create_component 只建空壳组件,子节点再用 reparent 归入;combine_as_variants 基于副本合并,原组件保留。
- 出现 ok=false 或「没找到 X 节点」:先 jsd_find 复核目标 id 是否已失效(可能被连坐删除),必要时 jsd_manage_nodes op=repair 清理悬挂节点后重试。
- GROUP 内部以 Frame 实现,序列化返回 FRAME 属正常。
- 插图标一律用 jsd_create_icon(Lucide 1764 个,支持别名/模糊联想),别手写 SVG。
- 平台特有能力(Figma 变量/本地样式/组件属性):先看 jsd_ping 返回的 platform+capabilities,再走 jsd_platform_op。`;

interface LiveSession {
  server: McpServer;
  handles: ToolHandle[];
}

/** 存活中的 MCP 会话(daemon 常驻,多个 AI 会话共享同一 Bridge) */
const liveSessions = new Set<LiveSession>();

function applyAvailability(session: LiveSession, connected: boolean): void {
  for (const handle of session.handles) {
    if (handle.alwaysEnabled) continue;
    if (connected) handle.enable();
    else handle.disable();
  }
}

/** 插件连接变化时,同步所有会话的工具可用性并广播 listChanged */
export function syncToolAvailability(connected: boolean): void {
  for (const session of liveSessions) {
    applyAvailability(session, connected);
    try {
      session.server.sendToolListChanged();
    } catch {
      // 会话已死,等 onclose 自行清理
    }
  }
  log(
    `工具可用性同步: ${connected ? '上线' : '离线'}(会话数 ${liveSessions.size})`,
  );
}

/** 装配 McpServer:注册全部工具(工具实现分散在 tools/*,此处只做编排) */
export function buildServer(bridge: Bridge): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      supportedProtocolVersions: ['2026-07-28', ...SUPPORTED_PROTOCOL_VERSIONS],
      instructions: INSTRUCTIONS,
    },
  );
  const handles: ToolHandle[] = [];
  for (const register of toolRegistrars) {
    handles.push(...register(server, bridge));
  }

  const session: LiveSession = { server, handles };
  liveSessions.add(session);
  // 新会话按当前连接状态初始化可用性(插件离线时除 ping 外全部隐藏)
  applyAvailability(session, bridge.isConnected);

  // 会话结束时从存活表摘除(链式保留 SDK 原有 onclose)
  const inner = server.server as unknown as { onclose?: () => void };
  const prevOnClose = inner.onclose;
  inner.onclose = () => {
    liveSessions.delete(session);
    prevOnClose?.();
  };

  return server;
}
