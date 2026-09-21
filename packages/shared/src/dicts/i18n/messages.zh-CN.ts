/**
 * 简体中文文案(键的**唯一真源**)。
 *
 * 为什么是这份当源:键集由它推导(`as const` → `MessageKey`),另一份用
 * `satisfies Record<MessageKey, string>` 声明 —— 漏译、多译都会在编译期报错,
 * 不需要靠人眼比对两份文件的键。
 *
 * 键命名 `<domain>.<subject>.<aspect>`;占位符统一 `{name}`,只做字符串替换(不引 ICU)。
 * 语言名(`中文`/`English`)在两侧都写原样:语言选择器里显示的是**自称**,不翻译。
 */
export const MESSAGES_ZH_CN = {
  // ── 平台名(dicts/platform.ts 的 label 表由此投影) ──
  'platform.jsdesign': '即时设计',
  'platform.figma': 'Figma',

  // ── 能力名(dicts/capability.ts 的 label 表由此投影) ──
  'capability.core.create': '创建',
  'capability.core.modify': '修改',
  'capability.core.structure': '结构操作',
  'capability.core.component': '组件',
  'capability.core.export': '导出',
  'capability.core.image': '图片填充',
  'capability.host.styles': '本地样式',
  'capability.host.textTruncation': '文本截断',
  'capability.host.componentProperties': '组件属性',
  'capability.host.variables': '变量',
  'capability.host.platformOps': '平台特有操作',
  'capability.host.inPlaceVariants': '原位合并变体',

  // ── 语言选择器 ──
  'locale.system': '跟随系统',
  'locale.zh-CN': '中文',
  'locale.en': 'English',
  // 触发器上的缩写:面板 360 宽,页头一行要塞状态/动作/端口/语言/日志,
  // 只放得下 1–2 个字符(全名留给下拉项)
  'locale.abbr.zh-CN': '中',
  'locale.abbr.en': 'EN',
  'locale.menu': '界面语言',
  'locale.title.followSystem': '界面语言:跟随系统(当前 {locale})',
  'locale.title.fixed': '界面语言:{locale}',

  // ── 状态徽章 ──
  'status.connected.label': '已连接',
  'status.connected.title': '服务在线,插件与 AI 会话已连通',
  'status.connecting.label': '连接中…',
  'status.connecting.title': '已连上后台服务,等待它确认这条通道',
  'status.waiting.label': '等待服务',
  'status.waiting.title': '服务离线时无需手动操作,AI 调用会自动拉起',
  'status.superseded.label': '已被接管',
  'status.superseded.title': '另一个插件面板占用了通道;点「夺回」可切回本面板',

  // ── 页头 ──
  'header.retry': '重试',
  'header.retry.title': '立即重连后台服务,不必等自动重连的退避间隔',
  'header.reclaim': '夺回',
  'header.reclaim.title': '夺回被另一个插件面板占用的通道',
  'header.meta': '{platform} · :{port}',
  'header.meta.portOnly': ':{port}',
  'header.meta.title':
    '运行平台 {platform} · MCP 桥接端口 {port}(可用环境变量 TEXT_TO_DESIGN_MCP_PORT 修改)',
  'header.meta.titleUnknown':
    '运行平台未知 · MCP 桥接端口 {port}(可用环境变量 TEXT_TO_DESIGN_MCP_PORT 修改)',

  // ── 连接提示条 ──
  'conn.connected':
    '已连接。选中画布节点后点「复制」,把内容发给 AI 助手——例如:「按这个节点样式帮我再做一张卡片」',
  'conn.superseded':
    '通道已被另一个插件面板接管(同一时刻只服务一个面板),自动重连已停止。点顶部状态徽章旁的「夺回」切回本面板。',
  'conn.disconnected.title': '尚未连接后台服务',
  'conn.disconnected.tutorial': '安装教程',
  'conn.copyAi': '① 复制给 AI 助手',
  'conn.copyDaemon': '② 复制启动命令',
  'conn.copied': '✓ 已复制',
  'conn.copyAi.hint': '发给 AI,让它调用 jsd_ping 唤醒后台服务',
  'conn.daemon.note':
    '在本机终端执行即常驻到下次重启;重复执行安全(已有实例会自动跳过)。',
  'conn.announce.connected': '已连接后台服务',
  'conn.announce.connecting': '正在连接后台服务',
  'conn.announce.superseded': '通道已被另一个插件面板接管',
  'conn.announce.disconnected': '尚未连接后台服务',
  'conn.wakeCmd':
    '请帮我连接 text-to-design 后台服务:\n\n1. 若尚未注册 MCP 服务:用你工具原生的方式注册一个 stdio MCP server,\n   命令 npx -y text-to-design-mcp@latest(无需手动安装,npx 会自动拉取运行)。\n\n2. 注册后调用 jsd_ping —— 这一步会唤醒(必要时自动拉起)后台常驻服务。\n   若返回「插件未连接」,请提示我在设计软件里运行 text-to-design 插件。',

  // ── 选中节点卡 ──
  'selection.title': '选中节点',
  'selection.badge': '{count} 个 · 序列化 {size}',
  'selection.copy': '复制',
  'selection.copied': '✓',
  'selection.expand': '展开节点列表',
  'selection.collapse': '收起节点列表',
  'selection.empty.title': '未选中节点',
  'selection.empty.hint': '在画布中点选节点后,这里会实时显示并支持复制',

  // ── 能力卡 ──
  'capability.card.title': '能力',
  'capability.card.missing': '能力表未获取(插件未连接)',
  'capability.card.badgeTitle':
    '核心能力项数 · 当前平台可用的差异能力 · 平台特有操作个数',
  'capability.card.badge': '核心 {core} · 平台 {host}/{total} · op {ops}',
  'capability.card.expand': '展开',
  'capability.card.collapse': '收起',
  'capability.card.coreSection': '核心能力(两平台一致)',
  'capability.card.hostSection': '平台差异能力',
  'capability.card.opTitle': '{op}:当前平台支持',
  'capability.card.opTitleOff': '{op}:当前平台不支持',
  'capability.card.opsSection': '平台特有操作',
  'capability.card.refresh': '刷新',
  'capability.card.noOps': '当前平台无特有操作',

  // ── 日志入口与抽屉 ──
  'log.trigger': '日志',
  'log.trigger.title': '日志:MCP 调用与连接事件',
  'log.trigger.unread': '日志,有 {count} 条新错误',
  'log.trigger.unit': '条错误',
  'log.trigger.announce': '有 {count} 条新错误',
  'log.drawer.title': '日志',
  'log.drawer.count': '{shown} / {total} 条',
  'log.drawer.clear': '清空',
  'log.drawer.close': '关闭日志',
  'log.drawer.filter.all': '全部',
  'log.drawer.filter.info': '信息+',
  'log.drawer.filter.warn': '警告+',
  'log.drawer.filter.error': '错误',
  'log.drawer.empty': '暂无日志。MCP 调用与连接事件会记录在这里。',
  'log.drawer.emptyFiltered':
    '当前档位「{filter}」下没有日志,切到「全部」看完整记录。',
  'log.drawer.copy': '复制',
  'log.drawer.newCount': '↓ {count} 条新日志',

  // ── bridge 日志行(UI 侧自己构造,故属出口②,就地 t()) ──
  'bridge.log.superseded':
    '通道已被另一个插件面板接管,自动重连已停止(点面板顶部的「夺回」可切回)',
  'bridge.log.confirmed': '服务已确认连接(版本 {version})',
  'bridge.log.handshakeTimeout': 'WS 握手超时({ms}ms),放弃本次连接: {port}',
  'bridge.log.serverConnected':
    'MCP server 已连接,等待服务确认: ws://localhost:{port}',
  'bridge.log.confirmTimeout': '服务确认超时,关闭重连: {port}',
  'bridge.log.closed': '连接断开: {port}',
  'bridge.log.stale': '服务确认过期({ms}ms 未收到心跳),关闭重连: {port}',
  'bridge.log.wsFailed': 'WS 消息处理失败: {message}',
  'bridge.log.recvRequest': '收到服务器请求: {method}',
  'bridge.log.recvResponse': '收到服务器响应(忽略): {id}',
  'bridge.log.forwardTimeout': '转发到插件超时: {method}',
  'bridge.log.pluginTimeout': '插件响应超时',
  'bridge.log.ignoreUnknown': '忽略未知插件消息: {type}',
  'bridge.log.codeFailed': 'code 消息处理失败: {message}',
  'bridge.log.sendFailed': '发送响应失败(server 未连接): {id}',
  'bridge.log.manualClose': '手动断开连接',
  'bridge.log.capabilityMissing': '能力表回包异常(缺 platform)',
  'bridge.log.capabilityFailed': '能力表获取失败: {message}',
  'bridge.log.pingOk': 'ping 插件成功: {data}',
  'bridge.log.pingFailed': 'ping 插件失败: {message}',
  'bridge.error.useBridge': 'useBridge 必须在 <BridgeProvider> 内使用',
} as const;
