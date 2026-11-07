import { version } from '../package.json' with { type: 'json' };

export const PORT = Number(process.env.TEXT_TO_DESIGN_MCP_PORT ?? 47812);
export const HTTP_PORT = Number(
  process.env.TEXT_TO_DESIGN_MCP_HTTP_PORT ?? 47820,
);
export const SERVER_NAME = 'text-to-design-mcp-server';
export const SERVER_VERSION = version;

export function resolveToolProfile(
  raw = process.env.TEXT_TO_DESIGN_TOOL_PROFILE,
): 'full' | 'compact' {
  if (raw == null || raw === '' || raw === 'full') return 'full';
  if (raw === 'compact') return 'compact';
  throw new Error(
    `Invalid TEXT_TO_DESIGN_TOOL_PROFILE: ${raw}; expected full or compact`,
  );
}

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

/**
 * 目录类结果(tools/list、prompts/list、resources/list)的缓存提示(2026-07-28 的
 * `ttlMs`/`cacheScope`)。目录在同一 daemon 版本下是静态的(固定注册清单 + 调用期
 * 平台门控),所以客户端可以安全地拿住一份目录 —— 目录本身 1.3 MB,每次重拉都是纯浪费。
 * 画布类资源(jsd://canvas/selection 等)不吃这个值:resources/read 恒为 0(不缓存)。
 */
export const CATALOG_TTL_MS = 300_000;

/**
 * 单个资源(非模板)的读取结果缓存时长,覆盖 server.ts 里那条全局 `resources/read: 0`。
 *
 * 为什么不能一刀切:全局 0 是对的默认 —— 画布事实每秒都可能变,缓存住会读到旧值。
 * 但有三个资源的变化频率差了两个数量级:
 * - `jsd://fonts`:字体库只在装/卸字体时才变,单次响应可达数百 KB —— 缓存 1 小时;
 * - `jsd://styles` / `jsd://page`:跟着文档改,但同一轮设计里会被连续读几次
 *   (先摸底、再确认复用件),给 30 秒让这几秒内的重复读省掉往返;
 * - 其余(选中 / 节点 / 平台态)恒 0:它们是「此刻的事实」,缓存即错误。
 *
 * 这是**客户端侧**的缓存声明,不是服务端缓存 —— 服务端每次仍然实时读插件。
 * 可用环境变量 TEXT_TO_DESIGN_RESOURCE_FONTS_TTL_MS / _DOCUMENT_TTL_MS 覆盖。
 */
export const RESOURCE_FONTS_TTL_MS = Number(
  process.env.TEXT_TO_DESIGN_RESOURCE_FONTS_TTL_MS ?? 60 * 60 * 1000,
);

export const RESOURCE_DOCUMENT_TTL_MS = Number(
  process.env.TEXT_TO_DESIGN_RESOURCE_DOCUMENT_TTL_MS ?? 30 * 1000,
);

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
 * jsd_batch 的步骤清单文件上限(字节)。
 *
 * 为什么要有这条:清单里装的是 nodeIds 之类的 id 数组,整页铺 token 时一份清单
 * 上千个 id、几十 KB 是正常的;但坏掉的生成脚本会输出指数级膨胀的清单,一次读进
 * 内存再解析会把 daemon 拖住。超限不截断、不猜,直接点名文件路径与两个体积。
 * 可用环境变量 TEXT_TO_DESIGN_MCP_MAX_CALLS_FILE_BYTES 覆盖。
 */
export const MAX_CALLS_FILE_BYTES = Number(
  process.env.TEXT_TO_DESIGN_MCP_MAX_CALLS_FILE_BYTES ?? 8 * 1024 * 1024,
);

/**
 * jsd_batch 明细落盘的单文件上限(字节)。
 *
 * 背景:步骤回显超预算时,把**整批**的完整明细写成 JSONL 落盘、回显只给路径 ——
 * 否则「超预算」等于「拿不到」(此前只回 id 清单,要明细得整批重跑一次,还得再受
 * 同一套预算约束)。坏掉的脚本会产出指数级膨胀的结果,一次写几十 MB 既拖住 daemon
 * 又没人读,故封顶;超限不截断、不猜,退回 id 清单并在 warnings 里点名两个体积。
 * 可用环境变量 TEXT_TO_DESIGN_MCP_MAX_BATCH_SPILL_BYTES 覆盖。
 */
export const MAX_BATCH_SPILL_BYTES = Number(
  process.env.TEXT_TO_DESIGN_MCP_MAX_BATCH_SPILL_BYTES ?? 32 * 1024 * 1024,
);

/** jsd_create_svg 的 SVG 源码体积上限(字节)。
 *  代码生成的图表常见几十 KB(正常),但坏掉的脚本会输出指数级膨胀的节点串,
 *  整份经文本帧下发会一路吃掉宿主内存。超限时不静默截断,直接报错并给抽稀建议。
 *  可用环境变量 TEXT_TO_DESIGN_MCP_MAX_SVG_BYTES 覆盖。 */
export const MAX_SVG_SOURCE_BYTES = Number(
  process.env.TEXT_TO_DESIGN_MCP_MAX_SVG_BYTES ?? 4 * 1024 * 1024,
);

/**
 * 单次 `tools/call` 的入参元素总上限(SDK 按「数组元素 + 对象成员」累加计)。
 *
 * 为什么要有这条:`jsd_batch` 内联 50 步、每步 args 又可以是任意大的对象/数组 ——
 * 之前没有任何上限,一个畸形的巨型 batch(或 `jsd_create_svg` 的巨型坐标数组)
 * 能在执行器拿到之前就把 daemon 内存吃掉。
 *
 * 取值依据:实测最大的合法调用是整屏批量改造,50 步 × 每步约 12 个字段再加以
 * 少量 id 数组,总量在 3k 以内;给出 20k 对正常用法宽松,对畸形入参仍能拦。
 * 可用环境变量 TEXT_TO_DESIGN_MCP_MAX_TOOL_INPUT_ELEMENTS 覆盖(设 `off` 关闭)。
 */
export const MAX_TOOL_INPUT_ELEMENTS = (() => {
  const raw = process.env.TEXT_TO_DESIGN_MCP_MAX_TOOL_INPUT_ELEMENTS;
  if (raw == null || raw.trim() === '') return 20_000;
  if (raw.trim().toLowerCase() === 'off') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : 20_000;
})();

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
