import {
  McpServer,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/server';
import type { Bridge } from './bridge';
import { SERVER_NAME, SERVER_VERSION } from './config';
import { log } from './logger';
import { toolRegistrars } from './tools';

/** initialize 时下发给客户端模型的使用纪律(与 AGENTS.md 保持同源) */
const INSTRUCTIONS = `操作设计画布的工具集。一个操作对应一个 jsd_* 工具,无 op 分发;聚合入口 jsd_manage_nodes / jsd_manage_components 仅用于批量/混合结构操作。调用纪律:
- 建节点用 per-type 工具:jsd_create_frame / jsd_create_rectangle / jsd_create_text 等,每个工具只建一类节点;多根/复杂嵌套树用 jsd_batch 编排多个建节点步骤。建完再 jsd_reparent_nodes 归组;auto-layout(layoutMode/itemSpacing/padding* 等)最后用 jsd_set_layout 单独设置。
- 改属性用专责工具:填充 jsd_set_fill_color、描边 jsd_set_stroke、圆角 jsd_set_cornerRadius、文本 jsd_set_text、位置 jsd_move_node、尺寸 jsd_resize_node、布局 jsd_set_layout、效果 jsd_set_effects、显隐 jsd_set_visibility、改名 jsd_rename_node、形状 jsd_set_shape。
- 跨工具多步流程用 jsd_batch 编排:双花括号占位符(步骤id.字段路径)引用上步结果,中间 id 不回传模型。
- ok=false 或「没找到 X 节点」:先 jsd_find 复核 id 是否已失效(可能被连坐删除),必要时 jsd_repair_nodes 清理后重试。`;

/** 存活中的 MCP 会话(daemon 常驻,多个 AI 会话共享同一 Bridge) */
const liveSessions = new Set<McpServer>();

/**
 * 插件连接变化时同步所有会话。
 *
 * 工具目录保持稳定:不再按连接状态 enable/disable。原因是隐藏式门控依赖客户端
 * 收到 listChanged 后主动重拉目录,而多数 MCP 客户端不处理该通知——会话若在插件
 * 离线时建立,工具表会被永久卡在 1 个(仅 jsd_ping)。可用性下沉到运行时:
 * Bridge.request 在离线时快速失败并返回明确提示,调用层同样拿到可读报错。
 */
export function syncToolAvailability(connected: boolean): void {
  for (const server of liveSessions) {
    try {
      server.sendToolListChanged();
    } catch {
      // 会话已死,等 onclose 自行清理
    }
  }
  log(
    `连接状态变化: ${connected ? '插件上线' : '插件离线'}(工具目录保持不变,会话数 ${liveSessions.size})`,
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
  for (const register of toolRegistrars) {
    register(server, bridge);
  }

  liveSessions.add(server);

  // 会话结束时从存活表摘除(链式保留 SDK 原有 onclose)
  const inner = server.server as unknown as { onclose?: () => void };
  const prevOnClose = inner.onclose;
  inner.onclose = () => {
    liveSessions.delete(server);
    prevOnClose?.();
  };

  return server;
}
