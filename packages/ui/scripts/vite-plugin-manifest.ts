import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PluginPlatform } from 'text-to-design-shared';

/**
 * 插件 id 一律来自**仓库根**的 `.env.local`(vite.config.ts 里 loadEnv 注入),仓库不再存:
 * 那串值是各平台开发者后台按「谁的插件」发的,别人的机器上不该是同一个。
 * 读不到就统一占位 `000`,且**流水线故意不注入** —— npm / Releases 上那份产物的 id
 * 恒为该占位,对应「未注册的本地插件」,导入即用;真要发布,是在平台侧的发布流程里带
 * 自己那串 id,而不是让公开产物继承某个人的插件号。
 */
const PLUGIN_ID_ENV: Record<PluginPlatform, string> = {
  jsdesign: 'JSDESIGN_PLUGIN_ID',
  figma: 'FIGMA_PLUGIN_ID',
  mastergo: 'MASTERGO_PLUGIN_ID',
};

const PLACEHOLDER_ID = '000';

/** 插件桥接依赖本机 daemon 的 WS/HTTP(端口见 47812,与 shared 的默认端口同源) */
const LOCAL_DAEMON_DOMAINS = [
  'ws://localhost:47812',
  'wss://localhost:47812',
  'http://localhost',
  'https://localhost',
];

/**
 * 平台 → manifest 的固定字段。`main`/`ui` 三平台同值,由 buildStart 统一补;
 * 新增平台在这里加一行(与 vite.config.ts 的 PLATFORM_ENTRIES 同源)。
 */
const MANIFEST_BASE: Record<
  PluginPlatform,
  (id: string) => Record<string, unknown>
> = {
  // 名字沿用即时设计开发者后台里那一份(与 id 配对,单方面改了会对不上)
  jsdesign: (id) => ({ name: 'text-to-design', api: '1.0.0', id }),
  figma: (id) => ({
    name: 'text-to-design',
    api: '1.0.0',
    editorType: ['figma'],
    permissions: ['activeusers'],
    id,
    // documentAccess: 'dynamic-page'(决策 0011)。
    // 该模式下同步文档访问 API(getNodeById / getLocal*Styles /
    // node.mainComponent / variables.getLocal*)会无条件抛异常 ——
    // core 已按 0011 完成异步化:解析与加载收口在 shared/core/access.ts
    // (resolveNodes / resolveMainComponent / listStylesAsync),
    // 属性管线(0001/0004)保持同步。改回 legacy 前先确认这些入口没被改回同步。
    networkAccess: {
      // allowedDomains 对发布态同样生效,devAllowedDomains 仅覆盖开发调试。
      allowedDomains: LOCAL_DAEMON_DOMAINS,
      devAllowedDomains: LOCAL_DAEMON_DOMAINS,
      reasoning:
        '该插件需要连接本地API服务以同步处理数据，若不开放localhost访问则核心功能将无法运行。',
    },
    documentAccess: 'dynamic-page',
  }),
  // 字段集与 Figma 不同(官方开发指南):没有 editorType / documentAccess /
  // networkAccess,权限只有 `currentuser` —— 而插件代码里没读 `mg.currentUser`,
  // 权限按「用到才要」给(将来要用再加,见 0017 的联调清单)。
  // id 是数字(Figma / jsDesign 那两家收字符串),env 里的值转一次;占位 000 落成 0。
  mastergo: (id) => ({
    name: 'text-to-design',
    api: '1.0.0',
    id: Number(id),
  }),
};

export default function manifestPlugin(
  platform: PluginPlatform,
  env: Record<string, string>,
) {
  const outDir = resolve(process.cwd(), 'dist', platform);
  return {
    name: `emit-manifest-${platform}`,
    buildStart() {
      const manifest = {
        // `||` 而非 `??`:配了但留空(FIGMA_PLUGIN_ID=)同样按没配处理,别把空串当 id
        ...MANIFEST_BASE[platform](
          env[PLUGIN_ID_ENV[platform]] || PLACEHOLDER_ID,
        ),
        main: 'code.js',
        ui: 'ui.html',
      };
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        resolve(outDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
      );
    },
    closeBundle() {
      const uiHtml = resolve(process.cwd(), 'dist', 'ui.html');
      if (existsSync(uiHtml)) {
        mkdirSync(outDir, { recursive: true });
        copyFileSync(uiHtml, resolve(outDir, 'ui.html'));
      }
    },
  };
}
