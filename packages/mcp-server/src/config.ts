import { version } from '../package.json' with { type: 'json' };

export const PORT = Number(process.env.TEXT_TO_DESIGN_MCP_PORT ?? 47812);
export const HTTP_PORT = Number(
  process.env.TEXT_TO_DESIGN_MCP_HTTP_PORT ?? 47820,
);
export const SERVER_NAME = 'text-to-design-mcp-server';
export const SERVER_VERSION = version;

/**
 * 本进程启动时刻。随 /health 上报,供后来者判断「常驻实例是否跑在旧构建上」:
 * 版本自检只比版本号,而开发期反复重建不改版本号,这个盲区会让「改了代码、
 * 重启了会话、改动却不生效」静默发生(见 probe.warnIfDaemonStale)。
 */
export const STARTED_AT = Date.now();

/** shim 等待 daemon 就绪的总预算(冷启动 + 版本替换叠加时的上限) */
export const DAEMON_WAIT_MS = 15000;
export const DAEMON_POLL_MS = 250;

/** 旧版 daemon 替换:等它退出并释放端口的预算。
 *  需覆盖「进程收到 /shutdown → 事件循环排空 → 端口释放 + TIME_WAIT」,
 *  过短会在仍可探到 health 时误判为外来服务占用 */
export const DAEMON_REPLACE_MS = 6000;

/** 工具超时分级:ping 短平快;导出/图片填充是大 IO(大图/大文件),放宽到 60s */
export const PING_TIMEOUT_MS = 5_000;
export const LONG_IO_TIMEOUT_MS = 60_000;

/** jsd_export 内联 base64(dataURL)的体积上限(字节)。
 *  超出该值一律不内联,改为落盘并返回路径引用。
 *  背景:内联大 base64 会随工具结果进入会话历史并常驻内存,
 *  实测会撑爆宿主进程堆(large_object_space 单调增长)导致 OOM。
 *  可用环境变量 TEXT_TO_DESIGN_MCP_MAX_INLINE_DATA_URL_BYTES 覆盖。 */
export const MAX_INLINE_DATA_URL_BYTES = Number(
  process.env.TEXT_TO_DESIGN_MCP_MAX_INLINE_DATA_URL_BYTES ?? 512 * 1024,
);

/** jsd_batch 整批上限:每步仍受自身 timeout 约束,此处只封顶整次编排 */
export const BATCH_TIMEOUT_MS = 120_000;

/**
 * 设计客户端:插件平台(即时设计/Figma/MasterGo)只有连上后由 ping 回包才可知,
 * 此处只放「平台未知时」的中性兜底与工具前缀 —— 具体平台名走
 * platform-state.currentClient()。写死单一平台会在连另一平台时给出错误指引。
 */
export const CLIENT = {
  label: '设计客户端',
  runtime: '设计工具',
  toolPrefix: 'jsd',
} as const;
