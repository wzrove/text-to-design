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
- 建节点用 per-type 工具:jsd_create_frame / jsd_create_rectangle / jsd_create_text 等,每个工具只建一类节点;多根/复杂嵌套树用 jsd_batch 编排多个建节点步骤。**根节点的 x/y 由 placement 决定**(缺省 center 用视口中心覆盖根节点自身的 x/y;要按坐标排布传 placement:{mode:"manual"},或 mode:"absolute"+x/y 统一坐标),层级结构用 children 嵌套(子节点 x/y 相对父节点)。建完再 jsd_reparent_nodes 归组(**parentId 显式传目标容器 id**;跨父级移动会保持节点绝对位置,内部自动换算新父下的 x/y,不用手动摆回,移入 auto-layout 容器时位置由布局接管);auto-layout(layoutMode/itemSpacing/padding* 等)最后用 jsd_set_layout 单独设置。
- 改属性用专责工具:填充 jsd_set_fill_color、描边 jsd_set_stroke、圆角 jsd_set_cornerRadius、文本 jsd_set_text、位置 jsd_move_node、尺寸 jsd_resize_node(可同时传 x/y)、布局 jsd_set_layout、效果 jsd_set_effects、显隐 jsd_set_visibility、改名 jsd_rename_node、形状 jsd_set_shape。
- 跨工具多步流程用 jsd_batch 编排:双花括号占位符(步骤id.字段路径)引用上步结果,中间 id 不回传模型;**占位符只在同一次调用的本批次内有效** —— 跨批次引用必报「占位符引用的步骤不存在或未成功」并中止整批,跨批次要硬编码上一步回显里的真实 id;步骤回显已做摘要裁剪(节点只留 id/name/type/x/y),含图标/矢量的批次(jsd_create_icon / jsd_clone_node)另配一次 jsd_export 目视验收 —— 回显不等于生效。
- 批量刷样式用 ids 一次下发:recursive=true 只作用于**后代**,不含目标节点自身(给一组图标容器刷描边,容器自己不会被套上方框);要连容器自身一起改才传 includeSelf=true。
- 实例子节点(位于 INSTANCE 内)的样式覆盖平台不保证渲染生效,命中时结果 warnings 直接给出主组件里对应子节点的 id —— 改主组件即所有实例继承。
- 结果键约定(写 jsd_batch 占位符靠这份,不靠 outputSchema —— 出参 schema 只投影到「键名+类型」级,见 daemon/compact-schema.ts):节点类结果 created 是单对象或数组(per-type create / jsd_clone_node / jsd_outline_stroke / jsd_create_instance / jsd_detach_instance 是**数组**,jsd_create_svg / jsd_create_icon / jsd_group_nodes / jsd_flatten_nodes / jsd_create_component / jsd_import_component 是**单对象**;jsd_manage_nodes 的 clone/outline_stroke 是数组,group/flatten 是单对象),updated / moved / swapped 是对象数组(键:id/name/type/x/y/width/height/z/parentId);id 清单类 selected / removed / ungrouped / cleaned 是字符串数组;jsd_find 回 nodes + total,jsd_get_selection 回 selection + pageName,jsd_export 回 exports(含 path / dataUrl)。占位符形如 {{上一步id.updated[0].id}},单对象写 {{id.created.id}}(多了 [0] 反而解析失败)。
- 结果 warnings 一律读:它点名的都是「回显成功但没生效」的事实(平台能力门控字段被忽略、字段回读与请求不一致如 root x/y 被 placement 覆盖 / TEXT 的 textAutoResize 未声明却被置 NONE、fontName 组合不存在被静默忽略、结构变更后的同层漂移),不要当成普通提示跳过。字体写法:family 用 jsd_list_fonts 的 fonts[].family 原样、style 用同一项的**全名**(如 SourceHanSansCN-Bold,不是简称 "Bold")。
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
