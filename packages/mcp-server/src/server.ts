import {
  McpServer,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/server';
import type { Bridge } from './bridge';
import { CATALOG_TTL_MS, SERVER_NAME, SERVER_VERSION } from './config';
import type { McpI18n } from './i18n';
import { createMcpI18n } from './i18n';
import { toolRegistrars } from './tools';

/**
 * 装配 McpServer:注册全部工具(工具实现分散在 tools/*,此处只做编排)。
 *
 * ## 调用方必须**每个 era 只装配一次**(见 docs/design-decisions/0030)
 *
 * 装配不是零成本:53 个工具的注册要重建一遍入参/出参的 JSON Schema 与 i18n 投影,
 * 实测 **51.7 ms/次**(热区在 create / props / components / nodes 的 schema 构造)。
 * 而 2026-07-28 的 `createMcpHandler` 是**按 HTTP 请求**调工厂的 —— 直接传
 * `() => buildServer(bridge)` 会让每次 tools/call 先花 50 ms 重建目录,再干正事。
 * 装配结果因此由调用方持有:daemon 是**整个进程一份**(`daemon/run.ts`),
 * shim 是**每个 stdio 连接一份**(`daemon/proxy.ts`)。
 *
 * 目录在同一 daemon 版本下是静态的(固定注册清单 + 调用期平台门控),所以复用实例
 * 不改变对外契约;也正因为目录恒定,**不再按插件连接状态发 list_changed** ——
 * 那条广播描述的目录从未变过。
 *
 * `cacheHints` 是 2026-07-28 的目录缓存声明(SEP-2549,见 0031):目录静态 → 允许客户端拿住一份
 * (目录本身约 1.3 MB,每次重拉是纯浪费);`resources/read` 恒 0 —— 画布事实不缓存,
 * 资源的每个字节都必须来自插件的实时读取。
 *
 * `i18n` 是**装配期**产物:工具面文案在注册时投影一次,之后不再变(不做运行期热切换,
 * 见 0016 候选表 —— 重跑 registerTool 会打乱宿主索引)。locale 只在这里解析一次
 * (`TEXT_TO_DESIGN_LANG` → 默认 `zh-CN`),显式传给每个 registrar(沿 0002:不设单例)。
 */
export function buildServer(
  bridge: Bridge,
  i18n: McpI18n = createMcpI18n(),
): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      supportedProtocolVersions: ['2026-07-28', ...SUPPORTED_PROTOCOL_VERSIONS],
      // INSTRUCTIONS 源码里存 MessageKey(0016):它是模型读的纪律文案,
      // 与工具描述同一套翻译,不另起一份
      instructions: i18n.t('mcp.instructions'),
      cacheHints: {
        'tools/list': { ttlMs: CATALOG_TTL_MS, cacheScope: 'private' },
        'prompts/list': { ttlMs: CATALOG_TTL_MS, cacheScope: 'private' },
        'resources/list': { ttlMs: CATALOG_TTL_MS, cacheScope: 'private' },
        'resources/templates/list': {
          ttlMs: CATALOG_TTL_MS,
          cacheScope: 'private',
        },
        'resources/read': { ttlMs: 0, cacheScope: 'private' },
      },
    },
  );
  for (const register of toolRegistrars) {
    register(server, bridge, i18n);
  }
  return server;
}
