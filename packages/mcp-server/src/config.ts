import { version } from '../package.json' with { type: 'json' };

export const PORT = Number(process.env.TEXT_TO_DESIGN_MCP_PORT ?? 47812);
export const HTTP_PORT = Number(
  process.env.TEXT_TO_DESIGN_MCP_HTTP_PORT ?? 47820,
);
export const SERVER_NAME = 'text-to-design-mcp-server';
export const SERVER_VERSION = version;
export const DAEMON_WAIT_MS = 5000;
export const DAEMON_POLL_MS = 250;

/** 工具超时分级:ping 短平快;导出/图片填充是大 IO(大图/大文件),放宽到 60s */
export const PING_TIMEOUT_MS = 5_000;
export const LONG_IO_TIMEOUT_MS = 60_000;

/** jsd_batch 整批上限:每步仍受自身 timeout 约束,此处只封顶整次编排 */
export const BATCH_TIMEOUT_MS = 120_000;

/** 设计客户端厂商:当前即时设计,扩展其他客户端(如 Figma)时替换此配置即可 */
export const CLIENT = {
  label: '即时设计',
  runtime: 'jsDesign',
  toolPrefix: 'jsd',
} as const;
