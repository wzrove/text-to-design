export const REPO_URL = 'https://github.com/wzrove/text-to-design';
export const RELEASES_URL = `${REPO_URL}/releases`;
export const MCP_COMMAND = 'npx -y text-to-design-mcp@latest';

/** 语言无关的事实(链接、路径、端口、图标名)。文案一律在 `i18n/messages/*`。 */

export const WS_PORT = 47812;
export const HTTP_PORT = 47820;

/** 联系方式:新增渠道只改这里 + 字典 contacts.labels,Header 自动带上图标按钮
 * 有 href 就跳转,没 href 就把 value 复制走 */
export type Contact = {
  id: 'qq';
  value?: string;
  href?: string;
};

export const CONTACTS: Contact[] = [{ id: 'qq', value: '1121373402' }];

export type DemoTaskId = 'card' | 'chart' | 'menu';

export type DemoTask = { id: DemoTaskId; sizeTag: string };

export const DEMO_TASKS: DemoTask[] = [
  { id: 'card', sizeTag: '300 × 200' },
  { id: 'chart', sizeTag: '640 × 400' },
  { id: 'menu', sizeTag: '320 × 480' },
];

export type PlatformId = 'jsdesign' | 'figma' | 'mastergo';

export type Platform = {
  id: PlatformId;
  latin: string;
  /** 相对插件包根目录的导入入口 */
  manifest: string;
};

export const PLATFORMS: Platform[] = [
  {
    id: 'jsdesign',
    latin: 'jsDesign',
    manifest: 'dist/jsdesign/manifest.json',
  },
  { id: 'figma', latin: 'Figma', manifest: 'dist/figma/manifest.json' },
  {
    id: 'mastergo',
    latin: 'MasterGo',
    manifest: 'dist/mastergo/manifest.json',
  },
];
