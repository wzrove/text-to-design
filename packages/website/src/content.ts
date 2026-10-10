export const REPO_URL = 'https://github.com/wzrove/text-to-design';
export const RELEASES_URL = `${REPO_URL}/releases`;
export const MCP_COMMAND = 'npx -y text-to-design-mcp@latest';
/** 联系方式:新增渠道只改这里,Header 自动带上图标按钮
 * 有 href 就跳转,没 href 就把 value 复制走 */
export type Contact = {
  id: string;
  label: string;
  value?: string;
  href?: string;
};

export const CONTACTS: Contact[] = [
  { id: 'qq', label: 'QQ群', value: '1121373402' },
];

export type DemoTaskId = 'card' | 'chart' | 'menu';

export type DemoTask = {
  id: DemoTaskId;
  label: string;
  prompt: string;
  toolLine: string;
  sizeTag: string;
};

export const DEMO_TASKS: DemoTask[] = [
  {
    id: 'card',
    label: '卡片',
    prompt:
      '在画布中心画一张 300×200 的卡片,标题叫「发布页」,背景浅灰,右下角一个绿色按钮。',
    toolLine: 'jsd_create_nodes → 3 节点已写入',
    sizeTag: '300 × 200',
  },
  {
    id: 'chart',
    label: '图表',
    prompt:
      '把这组月度数据画成柱状图:1–6 月,数值 32、58、41、77、64、90,坐标轴浅灰,柱子用品牌绿。',
    toolLine: 'jsd_html_to_design → 图表已生成',
    sizeTag: '640 × 400',
  },
  {
    id: 'menu',
    label: '菜单',
    prompt:
      '画一张咖啡店菜单,标题「山雾咖啡」,四款饮品带价格,底部一行「扫码点单」。',
    toolLine: 'jsd_create_nodes → 12 节点已写入',
    sizeTag: '320 × 480',
  },
];

export type Platform = {
  id: 'jsdesign' | 'figma' | 'mastergo';
  name: string;
  latin: string;
  /** 相对插件包根目录的导入入口 */
  manifest: string;
  importSteps: string[];
  /** 相对核心能力额外可用的平台特有能力 */
  extra: string;
};

export const PLATFORMS: Platform[] = [
  {
    id: 'jsdesign',
    name: '即时设计',
    latin: 'jsDesign',
    manifest: 'dist/jsdesign/manifest.json',
    importSteps: [
      '打开即时设计客户端,左侧栏点「插件」',
      '选择「导入」,指向 dist/jsdesign/manifest.json',
      '回到画布运行插件,面板显示「已连接」即就绪',
    ],
    extra:
      '核心能力全集:节点读写、自动布局、组件与实例、SVG/图标导入、图片导出。',
  },
  {
    id: 'figma',
    name: 'Figma',
    latin: 'Figma',
    manifest: 'dist/figma/manifest.json',
    importSteps: [
      '菜单 Plugins → Development → Import plugin from manifest',
      '选择 dist/figma/manifest.json',
      '运行插件,面板显示「已连接」即就绪',
    ],
    extra:
      '核心能力之外,额外支持变量、本地样式与组件属性(走 jsd_platform_op 通道)。',
  },
  {
    id: 'mastergo',
    name: '莫高设计',
    latin: 'MasterGo',
    manifest: 'dist/mastergo/manifest.json',
    importSteps: [
      '打开莫高设计客户端,进入「插件」→「开发者模式」',
      '点「创建 / 添加插件」,上传 dist/mastergo/manifest.json',
      '运行插件,面板显示「已连接」即就绪',
    ],
    extra: '核心能力之外,额外支持组件属性管理与组件集合内的变体切换。',
  },
];

export type Capability = { icon: string; title: string; desc: string };

export const CAPABILITIES: Capability[] = [
  {
    icon: 'Eye',
    title: '读取画布',
    desc: '拿到当前选中节点,或按名称、类型、id 查找;读到的结构可直接回灌给 AI。',
  },
  {
    icon: 'Square',
    title: '按描述画图',
    desc: '「画布中心来一张 300×200 的卡片,标题叫发布页,背景浅灰」——一句人话,生成节点树。',
  },
  {
    icon: 'Paintbrush',
    title: '改样式',
    desc: '填充、描边、圆角、阴影、文字排版、位置尺寸;一次改多组字段走聚合入口。',
  },
  {
    icon: 'Download',
    title: '导出图片',
    desc: '选中区域输出 PNG / JPG / SVG / PDF,本地图也能反向填充到节点。',
  },
  {
    icon: 'Component',
    title: '组件与实例',
    desc: '建组件、生成实例、批量同步同类实例的样式覆盖。',
  },
  {
    icon: 'Braces',
    title: 'HTML / SVG 转设计',
    desc: '内联 SVG、本地 SVG 文件、HTML 片段都能编译成画布节点,图表走代码生成再导入。',
  },
  {
    icon: 'Layers',
    title: '批量编排',
    desc: '一次请求顺序执行多步,双花括号占位符串起中间结果。',
  },
  {
    icon: 'WandSparkles',
    title: '平台特有能力',
    desc: 'Figma 变量与组件属性、MasterGo 集合级变体,统一由一个通用通道承载。',
  },
];

export type Tool = { name: string; desc: string };

export const TOOLS: Tool[] = [
  {
    name: 'jsd_ping',
    desc: '插件在线检测 + 三张能力表(核心 / 平台差异 / 平台特有 op)',
  },
  {
    name: 'jsd_get_selection · jsd_find',
    desc: '读选中、按名称类型 id 查节点',
  },
  {
    name: 'jsd_create_nodes',
    desc: '执行声明式节点指令(frame / rect / text / …)',
  },
  { name: 'jsd_update_node', desc: '一次写多组字段' },
  {
    name: 'jsd_html_to_design · jsd_create_svg',
    desc: 'HTML / SVG 转画布节点',
  },
  { name: 'jsd_batch', desc: '顺序多步 + 中间值占位' },
  { name: 'jsd_export', desc: 'PNG / JPG / SVG / PDF' },
  { name: 'jsd_platform_op', desc: '平台特有能力通用通道' },
];

export const INSTALL_PROMPT = `请帮我完整安装 text-to-design,并按步骤汇报进度:

1. 注册 MCP 服务:用你工具原生的方式注册一个 stdio MCP server,
   命令 npx -y text-to-design-mcp@latest(无需手动安装,npx 会自动拉取运行)。

2. 验证后台服务能启动:
   timeout 5 npx -y text-to-design-mcp@latest
   预期输出含 "[text-to-design-mcp] shim 模式" 或 "daemon 就绪"(首次会自动拉起常驻服务)。

3. 下载并解压设计软件插件到用户目录:
   cd ~ && npm pack text-to-design-ui
   mkdir -p text-to-design-plugin
   tar -xzf text-to-design-ui-*.tgz -C text-to-design-plugin --strip-components=1
   (若 npm 包尚未发布,改用 GitHub Releases 里的插件产物包)

4. 上述三步完成后,告知用户剩下两步需手动:
   - 在设计软件里导入插件:即时设计选 dist/jsdesign/manifest.json,
     Figma 选 dist/figma/manifest.json,MasterGo 用「插件 → 开发者模式 → 创建/添加插件」
     上传 dist/mastergo/manifest.json;运行插件,面板显示「已连接」即就绪
   - 重启 AI 会话,调用 jsd_ping 验证连通

5. 汇报完成情况。`;

export type Faq = { q: string; a: string };

export const FAQS: Faq[] = [
  {
    q: 'AI 说连不上插件怎么办?',
    a: '先看设计软件里的插件面板是否显示「已连接」。没有就重新运行插件,再重启 AI 会话。仍不通就调用 jsd_ping,它会返回插件侧真实能力表,连不上时一眼看出卡在哪一端。',
  },
  {
    q: '改完配置不生效?',
    a: '重启 AI 工具会话。MCP 服务列表在会话启动时读取,改完全局配置需要新会话才拿到。',
  },
  {
    q: '后台服务必须一直开着吗?',
    a: '默认由 AI 会话按需拉起。想常驻:npx -y text-to-design-mcp@latest daemon(命令幂等,重复执行安全)。想开机自启:换成 install-service,注册为用户级 launchd / systemd --user / 计划任务,注销用 uninstall-service,想先看计划加 --dry-run。',
  },
  {
    q: '端口冲突或要排查日志?',
    a: '插件桥接 WebSocket 固定 47812,HTTP 端点 47820,被占则启动失败。服务日志默认落在 /tmp/text-to-design-mcp.log;把 TEXT_TO_DESIGN_MCP_LOG_LEVEL 设为 debug 可看到帧级收发。插件面板自带日志区。',
  },
  {
    q: '三个平台能同时用吗?',
    a: '可以。插件包按平台分别构建产物,导入哪一份就操作哪个画布;后台服务只有一个,靠面板上的平台标识区分当前宿主。',
  },
];
