export const zh = {
  meta: {
    title: 'text-to-design — 让 AI 在设计软件里画图',
    description:
      'text-to-design 把 AI 助手接进即时设计、Figma、MasterGo:描述即可读取画布、绘制节点、改样式、导出图片。MCP 后台服务 + 平台插件,导入即用。',
    ogTitle: 'text-to-design — 让 AI 在设计软件里画图',
    ogDescription:
      'AI 助手直接操作画布:读取选中、按描述画图、改样式、导出图片。支持即时设计 / Figma / MasterGo。',
  },

  copy: {
    button: '复制',
    done: '已复制',
    aria: '复制到剪贴板',
  },

  header: {
    nav: {
      capabilities: '能力',
      platforms: '平台',
      install: '安装',
      faq: '排查',
    },
    navAria: '页面导航',
    langAria: '界面语言',
    repo: '源码仓库',
    download: '下载插件',
    themeTitle: '主题:{mode},点击切换',
    themeAria: '切换主题,当前{mode}',
    theme: { system: '跟随系统', light: '亮色', dark: '暗色' },
  },

  contacts: {
    labels: { qq: 'QQ群' },
    copyTitle: '{label} {value} · 点击复制',
    copyAria: '{label} {value},点击复制',
  },

  hero: {
    badge: 'MCP · 即时设计 / Figma / MasterGo',
    title: '让 AI 在你的{brand}里动手画图',
    titleBrand: '设计软件',
    lead: 'text-to-design 把 {assistants} 这类 AI 助手接进画布:读取选中内容、按你的描述画新图形、改样式、导出图片。你只管描述,它负责操作。',
    ctaDownload: '下载插件包',
    ctaDocs: '安装说明',
    support: '支持',
    service: '后台服务 · 一条命令',
    copyService: '复制后台服务命令',
    session: 'AI 会话',
    demoGroup: '演示任务',
    connected: '已连接',
    canvas: '画布',
    steps: ['提问', '调用工具', '写入画布'],
    footnote: '产物由真实工具面驱动 · 面板显示「已连接」即可开工',
    replay: '重播演示',
    assistants: { list: ['Qoder', 'WorkBuddy', '豆包'], sep: '、' },
    demo: {
      card: {
        label: '卡片',
        prompt:
          '在画布中心画一张 300×200 的卡片,标题叫「发布页」,背景浅灰,右下角一个绿色按钮。',
        toolLine: 'jsd_create_nodes → 3 节点已写入',
        titleChars: ['发', '布', '页'],
        tagDraft: 'draft',
        tagVersion: 'v2',
        button: '发布',
      },
      chart: {
        label: '图表',
        prompt:
          '把这组月度数据画成柱状图:1–6 月,数值 32、58、41、77、64、90,坐标轴浅灰,柱子用品牌绿。',
        toolLine: 'jsd_html_to_design → 图表已生成',
        axisTitle: '月度产出',
        peak: '峰值 90',
        months: ['1月', '2月', '3月', '4月', '5月', '6月'],
      },
      menu: {
        label: '菜单',
        prompt:
          '画一张咖啡店菜单,标题「山雾咖啡」,四款饮品带价格,底部一行「扫码点单」。',
        toolLine: 'jsd_create_nodes → 12 节点已写入',
        titleChars: ['山', '雾', '咖', '啡'],
        items: [
          { name: '美式', price: '¥12' },
          { name: '拿铁', price: '¥18' },
          { name: '山雾轻乳', price: '¥22' },
          { name: '冷萃', price: '¥16' },
        ],
        foot: '扫码点单',
      },
    },
  },

  platforms: {
    index: '01 / 平台',
    title: '三个平台,三份产物',
    lead: '同一个插件包按平台分别构建。先选你的设计软件,再按下面的路径导入 manifest。',
    tablistAria: '设计软件平台',
    stepsTitle: '{name} 导入步骤',
    manifestLabel: 'manifest 路径',
    copyManifest: '复制 manifest 路径',
    mastergoNote: '莫高设计以「上传插件」形态接入,选中的是同一份 manifest。',
    beforeLabel: '导入前:取产物',
    beforeItems: [
      '从 GitHub Releases 下载插件包并解压',
      '解压后目录内已含三平台产物,只需定位到当前平台那份 manifest',
    ],
    goReleases: '前往 Releases',
    items: {
      jsdesign: {
        name: '即时设计',
        steps: [
          '打开即时设计客户端,左侧栏点「插件」',
          '选择「导入」,指向 dist/jsdesign/manifest.json',
          '回到画布运行插件,面板显示「已连接」即就绪',
        ],
        extra:
          '核心能力全集:节点读写、自动布局、组件与实例、SVG/图标导入、图片导出。',
      },
      figma: {
        name: 'Figma',
        steps: [
          '菜单 Plugins → Development → Import plugin from manifest',
          '选择 dist/figma/manifest.json',
          '运行插件,面板显示「已连接」即就绪',
        ],
        extra:
          '核心能力之外,额外支持变量、本地样式与组件属性(走 jsd_platform_op 通道)。',
      },
      mastergo: {
        name: '莫高设计',
        steps: [
          '打开莫高设计客户端,进入「插件」→「开发者模式」',
          '点「创建 / 添加插件」,上传 dist/mastergo/manifest.json',
          '运行插件,面板显示「已连接」即就绪',
        ],
        extra: '核心能力之外,额外支持组件属性管理与组件集合内的变体切换。',
      },
    },
  },

  install: {
    index: '02 / 安装',
    title: '三步装好',
    lead: '第一步注册并验证后台服务,第二步按平台导插件,第三步重启会话握手。中间只有一步需要你手动点。',
    stepLabel: 'step {n}',
    steps: [
      {
        title: '把安装提示词丢给 AI',
        body: '后台服务由 AI 自己注册、自己验证,你不用碰配置文件。',
      },
      {
        title: '手动导入设计软件插件',
        body: '在即时设计 / Figma / 莫高设计里选对应平台的 manifest.json,运行后面板显示「已连接」。',
      },
      {
        title: '重启 AI 会话',
        body: '让 AI 调用 jsd_ping 确认连通,通了就能开工。',
      },
    ],
    promptLabel: '复制给 AI 的提示词',
    copyPrompt: '复制完整安装提示词',
    prompt: `请帮我完整安装 text-to-design,并按步骤汇报进度:

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

5. 汇报完成情况。`,
    whereLabel: '手动那步的产物在哪:',
  },

  footer: {
    blurb:
      'AI 助手 × 设计软件画布的桥。MIT 许可,后台服务与插件产物都公开在仓库里。',
    resources: '资源',
    links: {
      releases: '插件产物 / Releases',
      repo: '源码仓库',
      tools: '完整工具清单',
      readme: '安装与排查原文',
    },
    distribution: '分发',
    distributionItems: [
      'text-to-design-mcp(后台服务)',
      'text-to-design-ui(三平台插件)',
      '端口 47812 / 47820',
    ],
    contact: '联系我们',
    copyContact: '复制{label}',
    contactNote: '加群备注「text-to-design」,问题优先在仓库 Issue 留档。',
  },
};

export type Messages = typeof zh;
