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
  'platform.mastergo': 'MasterGo',

  // ── 能力名(dicts/capability.ts 的 label 表由此投影) ──
  'capability.core.create': '创建',
  'capability.core.modify': '修改',
  'capability.core.structure': '结构操作',
  'capability.core.component': '组件',
  'capability.core.export': '导出',
  'capability.core.image': '图片填充',
  'capability.host.styles': '本地样式',
  'capability.host.styleEnumeration': '本地样式清单(能列出有哪些样式)',
  'capability.host.styleEnumerationSync':
    '样式枚举走同步入口(运行时的 *Async 成员不可用)',
  'capability.host.mainComponentSync':
    '主组件走同步字段(运行时的 getMainComponentAsync 永不返回)',
  'capability.host.textTruncation': '文本截断',
  'capability.host.componentProperties': '组件属性',
  'capability.host.documentScopeRead': '文档范围读(能读非当前页)',
  'capability.host.variables': '变量',
  'capability.host.inPlaceVariants': '原位合并变体',

  // ── 语言选择器 ──
  // 两档直切(中 / EN),默认跟系统:没有「跟随系统」这一档,没选过本身就是它
  // (见 dec 0016;面板形状在 2026-10-26 由三档下拉改为两档直切)
  'locale.zh-CN': '中文',
  'locale.en': 'English',
  // 档位上的缩写:二级菜单一行,只放得下 1–2 个字符(全名进 aria-label)
  'locale.abbr.zh-CN': '中',
  'locale.abbr.en': 'EN',
  'locale.menu': '界面语言',

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
  'header.theme.toDark': '切换到暗色主题',
  'header.theme.toLight': '切换到亮色主题',
  'header.cameraLock.locked': '相机已锁定',
  'header.cameraLock.unlocked': '相机跟随',
  'header.cameraLock.title.locked':
    '相机已锁定:操作画布时不移动你的视口(点击改为跟随)',
  'header.cameraLock.title.unlocked':
    '相机跟随:操作画布后视口滚动缩放到结果(点击锁定)',
  // 最小化:窗口缩到 50×50,只剩 logo;双击 logo 恢复(dec 28008c70)
  'header.minimize': '最小化',
  'header.minimize.title': '最小化面板,只留 logo;双击 logo 恢复',
  'header.restore.title': '双击 logo 恢复面板',

  // ── 版本升级提示(0038) ──
  // 只在「确有新版本」时出现:daemon 代查 npm latest,查不到就不挂这颗钮。
  'upgrade.title': '有新版本可用(点击查看升级步骤)',
  'upgrade.modal.title': '升级到最新版本',
  'upgrade.current': '当前 {version}',
  'upgrade.latest': '最新 {version}',
  'upgrade.plugin.label': '插件',
  'upgrade.service.label': '后台服务',
  // 两条升级路径不一样,别写成同一句:mcp 由 AI 工具用 npx latest 自动拉取(重启
  // 会话即可),ui 是插件包,得下载到本地再在设计软件里导入 manifest。
  // 文案按「一句话一个动作」写:不解释原理,不总结升华,不用破折号与冒号。
  'upgrade.step.service':
    '① 后台服务,重启 AI 会话就行。它跑的是 npx -y text-to-design-mcp@latest,每次都是最新的',
  // ② 拆成 head / tail 两段:中间那颗 `text-to-design-ui` 是 releases 链接,
  // 不能整句当一个字符串渲染(那样只能整句可点或整句不可点)
  'upgrade.step.plugin.head': '② 插件要手动换。下载',
  'upgrade.step.plugin.tail': '最新版解压,在设计软件里导入对应平台的 manifest',
  'upgrade.step.verify': '③ 重新运行插件,顶部的升级图标没了就是对齐了',
  'upgrade.copy': '复制给 AI 助手',
  'upgrade.prompt':
    '我在用 text-to-design,插件 text-to-design-ui 当前 {ui}、最新 {uiLatest},后台服务 text-to-design-mcp 当前 {mcp}、最新 {mcpLatest}。帮我升到最新:① 确认 MCP 配置里的命令带 latest,然后重启 AI 会话;② 下载 text-to-design-ui 最新版(npm pack 或 GitHub Releases 的 zip)解压,告诉我即时设计 / Figma / MasterGo 分别该导入 dist 下哪份 manifest.json;③ 完成后回报两个版本号。',

  // ── 轻提示(操作结果,不用管是哪颗按钮弹的) ──
  // 只在「做完了但看不出来」的操作上弹:复制的结果在系统剪贴板里,相机锁只换个
  // 14px 图标。界面本身变了的(开合抽屉、切主题、清空日志)不弹,那是噪声。
  'toast.copy.done': '已复制',
  'toast.copy.failed': '复制失败',

  // ── 连接提示条 ──
  'conn.connected':
    '已连接。选中画布节点后点「复制」,把内容发给 AI 助手——例如:「按这个节点样式帮我再做一张卡片」',
  'conn.superseded':
    '通道已被另一个插件面板接管(同一时刻只服务一个面板),自动重连已停止。点顶部状态徽章旁的「夺回」切回本面板。',
  'conn.disconnected.title': '尚未连接后台服务',
  'conn.disconnected.tutorial': '安装教程',
  'conn.copyAi': '① 复制给 AI 助手',
  'conn.copyDaemon': '② 复制启动命令',
  'conn.copyAi.hint': '发给 AI,让它调用 jsd_ping 唤醒后台服务',
  'conn.daemon.note':
    '在本机终端执行即常驻到下次重启;重复执行安全(已有实例会自动跳过)。',
  'conn.announce.connected': '已连接后台服务',
  'conn.announce.connecting': '正在连接后台服务',
  'conn.announce.superseded': '通道已被另一个插件面板接管',
  'conn.announce.disconnected': '尚未连接后台服务',
  'conn.wakeCmd':
    '请帮我连接 text-to-design 后台服务:\n\n1. 若尚未注册 MCP 服务:用你工具原生的方式注册一个 stdio MCP server,\n   命令 npx -y text-to-design-mcp@latest(无需手动安装,npx 会自动拉取运行)。\n\n2. 注册后调用 jsd_ping —— 这一步会唤醒(必要时自动拉起)后台常驻服务。\n   若返回「插件未连接」,请提示我在设计软件里运行 text-to-design 插件。',

  // ── 展开面板(所有「标题行 + 可折叠正文」共用,见 0026)──
  // 触发器是图标按钮,这两个名字只进屏读器/悬浮提示,不上屏 ——
  // 故不需要区分「展开节点列表」「展开能力表」:按钮就在各自的标题行里,
  // 上下文由它所在的位置给出,名字再重复一遍只是把同一句话说两遍。
  'panel.expand': '展开',
  'panel.collapse': '收起',
  'panel.close': '关闭',

  // ── 选中节点卡 ──
  'selection.title': '选中节点',
  'selection.badge': '{count} 个 · 序列化 {size}',
  'selection.copy': '复制',
  'selection.empty.title': '未选中节点',
  'selection.empty.hint': '在画布中点选节点后,这里会实时显示并支持复制',

  // ── 能力卡 ──
  'capability.card.title': '能力',
  'capability.card.missing': '能力表未获取(插件未连接)',
  'capability.card.badgeTitle':
    '核心能力项数 · 当前平台可用的差异能力 · 平台特有操作个数',
  'capability.card.badge': '核心 {core} · 平台 {host}/{total} · op {ops}',
  'capability.card.coreSection': '核心能力',
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
  'bridge.log.versionPush': '收到 npm 最新版本: 插件 {ui}、服务 {mcp}',
  'bridge.log.versionUnknown': '未查到',
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
  // ── 值域说明(挂在字段 schema 上的「这个值长什么样」) ──
  'schemaValue.color':
    '颜色:hex(如 "#ff0000";8 位 hex 的 alpha 转为 paint opacity)或 {r,g,b}(通道 0-1,>1 视为 0-255)',
  'schemaValue.rgba':
    '颜色:hex(如 "#ff000080")或 {r,g,b,a}(通道 0-1,>1 视为 0-255;a 缺省 1)',
  'schemaValue.gradientStops': '渐变停止点,至少 2 个',
  'schemaValue.constraint':
    'MIN=吸附左/上|MAX=吸附右/下|STRETCH=拉伸|CENTER=居中|SCALE=等比缩放',

  'schemaValue.strokeJoin': '拐角连接:斜接/斜切/圆角',
  'schemaValue.strokeCap': '端点样式;ARROW_* 仅 Figma',
  'schemaValue.textDecoration': '装饰线,缺省 NONE',
  'schemaValue.textCase': '大小写变换,缺省 ORIGINAL',
  'schemaValue.scaleMode': '缩放模式:填充裁剪|完整适配|裁剪|平铺',
  'schemaValue.arcData': '环形路径参数,可画圆环',
  // ── zod .describe 字段说明(见 0016:schema 存键,边界投影成文案) ──
  'schema.base.r':
    '红色通道,范围 0-1(0=无,1=满),如纯红为 1;>1 视为 0-255,自动整组归一化',
  'schema.base.g': '绿色通道,范围 0-1(或 0-255 自动归一化)',
  'schema.base.b': '蓝色通道,范围 0-1(或 0-255 自动归一化)',
  'schema.base.a':
    '不透明度,范围 0-1(0=全透明,1=不透明),缺省按 1 处理;>1 视为 0-255 自动归一化',
  'schema.base.color': '该停止点的颜色(带 alpha)',
  'schema.base.position': '停止点位置,范围 0-1(0=起点,1=终点)',
  'schema.base.transformSchema': '2×3 仿射;[[1,0,0],[0,1,0]]=无变换',
  'schema.base.type': '填充类型:纯色',
  'schema.base.opacity': '不透明度 0-1,缺省 1',
  'schema.base.visible': '是否可见,缺省 true',
  'schema.base.blendMode': '混合模式,缺省 NORMAL',
  'schema.base.blendMode2': '纯色填充(SOLID):{color:{r,g,b}}',
  'schema.base.type2': '填充类型:线性渐变',
  'schema.base.gradientStops': '渐变停止点数组(至少 2 个,定义颜色与位置)',
  'schema.base.gradientTransform': '线性渐变(GRADIENT_LINEAR):沿直线方向过渡',
  'schema.base.type3': '填充类型:径向渐变',
  'schema.base.gradientStops2': '渐变停止点数组(至少 2 个,定义颜色与位置)',
  'schema.base.gradientTransform2': '径向渐变(GRADIENT_RADIAL):从中心向外辐射',
  'schema.base.type4': '填充类型:角度渐变',
  'schema.base.gradientStops3': '渐变停止点数组(至少 2 个,定义颜色与位置)',
  'schema.base.gradientTransform3': '角度渐变(GRADIENT_ANGULAR):沿圆周方向过渡',
  'schema.base.type5': '填充类型:图片填充',
  'schema.base.imageHash': '图片资源哈希(由 jsd_fill_image 等注入)',
  'schema.base.scaleMode':
    '缩放模式:FILL=填充裁剪|FIT=完整适配|CROP=裁剪|TILE=平铺',
  'schema.base.scaleMode2': '图片填充(IMAGE):以 imageHash 引用图片',
  'schema.base.type6': '效果类型:外阴影(投影到节点外侧)',
  'schema.base.color2': '阴影颜色(带 alpha 透明度)',
  'schema.base.x': '水平偏移(px),正值向右',
  'schema.base.y': '垂直偏移(px),正值向下',
  'schema.base.y2': '阴影偏移向量(px)',
  'schema.base.radius': '模糊半径(px),>=0',
  'schema.base.spread': '扩散(px),正值扩大阴影、负值收缩,默认 0',
  'schema.base.visible2': '是否可见,默认 true',
  'schema.base.blendMode3': '混合模式,默认 NORMAL',
  'schema.base.showShadowBehindNode':
    '是否在节点后方显示阴影(即便节点不透明也透出)',
  'schema.base.showShadowBehindNode2':
    '外阴影(DROP_SHADOW):投影到节点外侧的阴影',
  'schema.base.type7': '效果类型:内阴影(投影到节点内侧)',
  'schema.base.color3': '阴影颜色(带 alpha 透明度)',
  'schema.base.x2': '水平偏移(px),正值向右',
  'schema.base.y3': '垂直偏移(px),正值向下',
  'schema.base.y4': '阴影偏移向量(px)',
  'schema.base.radius2': '模糊半径(px),>=0',
  'schema.base.spread2': '扩散(px),正值扩大、负值收缩,默认 0',
  'schema.base.visible3': '是否可见,默认 true',
  'schema.base.blendMode4': '混合模式,默认 NORMAL',
  'schema.base.blendMode5': '内阴影(INNER_SHADOW):投影到节点内侧的阴影',
  'schema.base.type8': '效果类型:图层模糊(模糊整个节点本身)',
  'schema.base.radius3': '模糊半径(px),>=0',
  'schema.base.visible4': '是否可见,默认 true',
  'schema.base.visible5': '图层模糊(LAYER_BLUR):模糊节点自身',
  'schema.base.type9': '效果类型:背景模糊(模糊节点背后的内容)',
  'schema.base.radius4': '模糊半径(px),>=0',
  'schema.base.visible6': '是否可见,默认 true',
  'schema.base.visible7': '背景模糊(BACKGROUND_BLUR):模糊节点背后的内容',
  'schema.base.pattern': '网格类型:ROWS|COLUMNS|GRID',
  'schema.base.alignment': '对齐:MIN|MAX|CENTER|STRETCH',
  'schema.base.sectionSize': '分节尺寸(px)',
  'schema.base.gutterSize': '沟槽尺寸(px)',
  'schema.base.offset': '偏移(px)',
  'schema.base.windingRule': '环绕规则:NONZERO|EVENODD|NONE,默认 NONZERO',
  'schema.base.value': '行高数值(px)',
  'schema.base.unit': '单位:PIXELS=固定像素',
  'schema.base.value2': '行高数值(百分比)',
  'schema.base.unit2': '单位:PERCENT=百分比',
  'schema.base.unit3': '单位:AUTO=自动行高',
  'schema.base.unit4': '自动行高:{unit: "AUTO"},无需传 value',
  'schema.base.unit5': '单位:PIXELS=像素 | PERCENT=百分比',
  'schema.batch.calls': '按数组顺序执行的步骤列表(与 callsFile 二选一)',
  'schema.batch.callsFile':
    '步骤清单所在的 JSON 文件(绝对路径,与 calls 二选一)。参数体大到写不进上下文时用它 —— 文件内容为 {"calls":[…]}(或直接给一个数组,两种形状等价),形状与 calls 一致,可含 stopOnError / checkDrift。文件内容会被当作调用参数读入',
  'schema.batch.ok': '全部步骤均执行且成功(executed 小于 total 即为中途停止)',
  'schema.batch.executed': '实际产生结果的步骤数',
  'schema.batch.total': '计划的步骤总数',
  'schema.batch.error': '失败原因(人读文本)',
  'schema.batch.error2':
    '各步骤结果,顺序与入参一致;被中止而未执行的步骤不出现在此列表',
  'schema.executeOp.depth':
    '序列化深度:0=仅自身,1=含直接子节点,2=含孙节点;缺省 2',
  'schema.executeSchemas.isMask': '作遮罩用(几何区域不变)',
  'schema.executeSchemas.childrenOf':
    '子节点,最多 100 个直接子节点;x/y 相对父节点,缺省叠在 (0,0)。更大的结构分批建后用 jsd_reparent_nodes 归组',
  'schema.executeSchemas.fills':
    '填充。FRAME 缺省白底;其他图形同时传 strokes 时填充置空(纯描边)—— 要底色请显式传 fills',
  'schema.executeSchemas.layoutMode':
    '自动布局方向;传 itemSpacing/padding*/primaryAxis* 前必须先设为 HORIZONTAL 或 VERTICAL',
  'schema.executeSchemas.itemSpacing':
    '项间距(px),需先设 layoutMode;primaryAxisAlignItems=SPACE_BETWEEN 时忽略',
  'schema.executeSchemas.primaryAxisAlignItems':
    '主轴对齐;为 SPACE_BETWEEN 时 itemSpacing 被忽略',
  'schema.executeSchemas.frameNote':
    'FRAME=容器(可 auto-layout)。不传 fills 时引擎默认白底,透明请传 fills:[{type:"SOLID",color:{r:0,g:0,b:0},opacity:0}]',
  'schema.executeSchemas.vectorNote':
    'VECTOR=矢量(配合 vectorPaths 传 SVG path data)。⚠ 创建后 vectorPaths 偶发丢失/形变,短直线段改用 LINE+rotation',
  'schema.executeSchemas.characters':
    '文本内容。个别 emoji 依赖客户端字体可能缺字(渲染成 ☒),上线前逐个目检',
  'schema.executeSchemas.fontName':
    '字体 {family,style},需精确匹配;先用 jsd_list_fonts 查可用字体(不可用时静默回退默认)',
  'schema.executeSchemas.textAutoResize':
    '文本自适应:缺省 WIDTH_AND_HEIGHT=按内容撑开(此时 width/height 被覆盖)|HEIGHT=固定宽自适应高|NONE=固定尺寸|TRUNCATE=截断',
  'schema.executeSchemas.type': '子节点类型',
  'schema.executeSchemas.x': '相对父节点的 X(px)',
  'schema.executeSchemas.y': '相对父节点的 Y(px)',
  'schema.executeSchemas.x2': 'X(px,相对父节点,缺省 0;根节点见 placement)',
  'schema.executeSchemas.y2': 'Y(px,相对父节点,缺省 0;根节点见 placement)',
  'schema.executeSchemas.width': '宽度(px)',
  'schema.executeSchemas.height': '高度(px)',
  'schema.executeSchemas.rotation': '旋转角(deg),绕左上角原点',
  'schema.executeSchemas.opacity': '不透明度 0-1',
  'schema.executeSchemas.strokes': '描边列表,整体替换(非合并)',
  'schema.executeSchemas.strokeWeight': '描边宽度(px);分边字段缺省时按它',
  'schema.executeSchemas.strokeTopWeight':
    '上边框宽(px);设了则覆盖 strokeWeight',
  'schema.executeSchemas.strokeBottomWeight': '下边框宽(px);同上',
  'schema.executeSchemas.strokeLeftWeight': '左边框宽(px);同上',
  'schema.executeSchemas.strokeRightWeight': '右边框宽(px);同上',
  'schema.executeSchemas.strokeAlign': '描边对齐(缺省 INSIDE)',
  'schema.executeSchemas.strokeCap': '端点样式;ARROW_* 仅 Figma',
  'schema.executeSchemas.strokeJoin': '拐角连接样式',
  'schema.executeSchemas.dashPattern': '虚线:段长数组,如 [4,4]',
  'schema.executeSchemas.effects': '效果列表(阴影/模糊)',
  'schema.executeSchemas.vertical': '父容器缩放时的约束',
  'schema.executeSchemas.clipsContent': '是否裁剪溢出内容',
  'schema.executeSchemas.cornerSmoothing': '圆角平滑度 0-1',
  'schema.executeSchemas.layoutGrids': '布局网格(参考线)',
  'schema.executeSchemas.cornerRadius':
    '圆角半径(px),四角统一(LINE/TEXT 无圆角)',
  'schema.executeSchemas.topLeftRadius': '左上圆角(px)',
  'schema.executeSchemas.topRightRadius': '右上圆角(px)',
  'schema.executeSchemas.bottomLeftRadius': '左下圆角(px)',
  'schema.executeSchemas.bottomRightRadius': '右下圆角(px)',
  'schema.executeSchemas.paddingTop': '上内边距(px)',
  'schema.executeSchemas.paddingRight': '右内边距(px)',
  'schema.executeSchemas.paddingBottom': '下内边距(px)',
  'schema.executeSchemas.paddingLeft': '左内边距(px)',
  'schema.executeSchemas.primaryAxisSizingMode': '主轴尺寸模式:FIXED|AUTO',
  'schema.executeSchemas.counterAxisSizingMode': '交叉轴尺寸模式:FIXED|AUTO',
  'schema.executeSchemas.counterAxisAlignItems': '交叉轴对齐',
  'schema.executeSchemas.layoutGrow': '父布局主轴剩余空间的伸展系数(0=不伸)',
  'schema.executeSchemas.layoutAlign': '父布局交叉轴上的自对齐',
  'schema.executeSchemas.type2': 'RECTANGLE=矩形',
  'schema.executeSchemas.startingAngle': '起始角度(rad)',
  'schema.executeSchemas.endingAngle': '结束角度(rad)',
  'schema.executeSchemas.innerRadius': '内半径(0-1 ratio)',
  'schema.executeSchemas.innerRadius2': '环形路径参数(弧线),可画圆环',
  'schema.executeSchemas.ellipseNote': 'ELLIPSE=椭圆(配合 arcData 可画环)',
  'schema.executeSchemas.type3': 'LINE=线段',
  'schema.executeSchemas.pointCount': '多边形角点数,如 6=六边形',
  'schema.executeSchemas.bottomRightRadius3': 'POLYGON=多边形(配合 pointCount)',
  'schema.executeSchemas.pointCount2': '星形角点数,如 5=五角星',
  'schema.executeSchemas.innerRadius4':
    '星形内半径比例(0-1,相对外半径),越小角越尖',
  'schema.executeSchemas.cornerRadius4': '圆角半径(px)',
  'schema.executeSchemas.bottomRightRadius5':
    'STAR=星形(配合 pointCount + innerRadius)',
  'schema.executeSchemas.vectorPaths':
    '矢量路径数组,每项含 SVG path data(如 "M0 0 L100 100")',
  'schema.executeSchemas.fontSize': '字号(px),默认 16',
  'schema.executeSchemas.textAlignHorizontal': '水平对齐,缺省 LEFT',
  'schema.executeSchemas.textAlignVertical': '垂直对齐,缺省 TOP',
  'schema.executeSchemas.textCase': '大小写变换,缺省 ORIGINAL',
  'schema.executeSchemas.textDecoration': '装饰线,缺省 NONE',
  'schema.executeSchemas.lineHeight':
    '行高:{value,unit},unit 为 PIXELS|PERCENT;或 {unit:"AUTO"}',
  'schema.executeSchemas.letterSpacing':
    '字距:{value,unit},unit 为 PIXELS|PERCENT',
  'schema.executeSchemas.letterSpacing2':
    'TEXT=文本(配合 characters/fontSize/fontName 等)',
  'schema.executeSchemas.children': '子节点数组,至少 2 个',
  'schema.executeSchemas.path': 'GROUP=分组(内部用 Frame 实现)',
  'schema.executeSchemas.children2': '要合并的子节点,至少 2 个',
  'schema.executeSchemas.children3': 'BOOLEAN_OPERATION=布尔运算(合并子节点)',
  'schema.execute.name': '生成的图层名,默认 svg-design',
  'schema.execute.html': 'HTML 片段,支持内联 style',
  'schema.execute.name2': '生成的图层名,默认 html-design',
  'schema.execute.size': '图标边长 px,默认 24',
  'schema.execute.color': '描边颜色(十六进制),默认 #000000',
  'schema.execute.strokeWidth': '描边宽度,默认 2',
  'schema.execute.name3': '生成的图层名,默认 icon-<图标名>',
  'schema.inputs.ids': '按节点 id 精确查找,优先级最高',
  'schema.inputs.name': '按名称模糊匹配(包含)',
  'schema.inputs.recursive': '是否递归查找(默认 true)',
  'schema.inputs.depth': '序列化深度:0=仅自身,1=含直接子节点;缺省 1',
  'schema.inputs.name2': '仅 group:组名',
  'schema.inputs.paddingTop': '仅 group。上内边距(px)',
  'schema.inputs.paddingRight': '仅 group。右内边距(px)',
  'schema.inputs.paddingBottom': '仅 group。下内边距(px)',
  'schema.inputs.paddingLeft': '仅 group。左内边距(px)',
  'schema.inputs.primaryAxisSizingMode': '仅 group。主轴尺寸模式:FIXED|AUTO',
  'schema.inputs.counterAxisSizingMode': '仅 group。交叉轴尺寸模式:FIXED|AUTO',
  'schema.inputs.counterAxisAlignItems': '仅 group。交叉轴对齐:MIN|MAX|CENTER',
  'schema.inputs.key': '团队库组件唯一标识 Key(仅 import_component 必填)',
  'schema.inputs.componentId':
    '目标组件(COMPONENT)节点 id(仅 swap_component 必填)',
  'schema.inputs.format': '导出格式,默认 PNG',
  'schema.inputs.scale': '缩放倍率(PNG/JPG),默认 1',
  'schema.inputs.savePath': '落盘文件绝对路径,如 /tmp/icon.png',
  'schema.inputs.includeDataUrl': '是否同时返回 base64 dataURL,默认 false',
  'schema.inputs.ids2': '要填充图片的节点 id 列表',
  'schema.inputs.sourcePath': '本地图片文件绝对路径,如 /tmp/poster.png',
  'schema.inputs.params': '操作参数,结构随 op 而定',
  'schema.inputs.family':
    '按家族名过滤(不区分大小写的子串),如 "Source" 或 "思源"',
  'schema.inputs.offset': '分页起始序号(跳过多少族),默认 0',
  'schema.inputs.limit':
    '本页最多返回多少族,默认 50、上限 500;字体库可达约 1900 族,整表会撑爆上下文',
  'schema.platform.name': 'op 名,调用 jsd_platform_op 时原样传',
  'schema.platform.description': '含 params 形状说明',
  'schema.results.capabilities':
    '当前平台支持的能力列表(先查此字段再决定能否调用平台特有操作)',
  'schema.results.families': '可用字体族(family)列表',
  'schema.results.family': '字体族',
  'schema.results.styles': '该族可用字型,如 ["Regular","Medium","Bold"]',
  'schema.results.count': '本页返回的字体族数量',
  'schema.results.total': '过滤后的字体族总数(不受分页影响)',
  'schema.results.offset': '本页起始序号',
  'schema.results.truncated': '为 true 表示还有下一页,用 offset 继续取',
  'schema.sharedProps.width': '宽度(px)',
  'schema.sharedProps.height': '高度(px)',
  'schema.sharedProps.rotation': '旋转角度(deg,绕节点自身左上角原点,x/y 不变)',
  'schema.sharedProps.opacity': '不透明度 0-1',
  'schema.sharedProps.pointCount': '多边形/星形角点数(仅 POLYGON/STAR 生效)',
  'schema.sharedProps.innerRadius':
    '星形内半径比例(0-1,相对外半径;仅 STAR 生效)',
  'schema.sharedProps.strokes': '描边列表,整体替换(非合并)',
  'schema.sharedProps.strokeWeight': '描边宽度(px);分边字段缺省时按它',
  'schema.sharedProps.strokeTopWeight': '上边框宽(px);设了则覆盖 strokeWeight',
  'schema.sharedProps.strokeBottomWeight': '下边框宽(px);同上',
  'schema.sharedProps.strokeLeftWeight': '左边框宽(px);同上',
  'schema.sharedProps.strokeRightWeight': '右边框宽(px);同上',
  'schema.sharedProps.strokeAlign': '描边对齐(缺省 INSIDE)',
  'schema.sharedProps.strokeCap': '端点样式;ARROW_* 仅 Figma',
  'schema.sharedProps.strokeJoin': '拐角连接样式',
  'schema.sharedProps.dashPattern': '虚线:段长数组,如 [4,4]',
  'schema.sharedProps.strokeStyleId':
    '描边样式 id(团队库样式;平台无此能力时被忽略)',
  'schema.sharedProps.cornerRadius':
    '圆角半径(px),四角统一;LINE/TEXT 无圆角;分角字段覆盖它',
  'schema.sharedProps.topLeftRadius': 'schema.sharedProps.cornerRadius',
  'schema.sharedProps.topRightRadius': '右上圆角(px),适用类型同 cornerRadius',
  'schema.sharedProps.bottomLeftRadius': '左下圆角(px),适用类型同 cornerRadius',
  'schema.sharedProps.bottomRightRadius':
    '右下圆角(px),适用类型同 cornerRadius',
  'schema.sharedProps.characters': '文本内容(仅 TEXT 节点生效)',
  'schema.sharedProps.fontSize': '字号(px)',
  'schema.sharedProps.textAlignHorizontal': '水平对齐,缺省 LEFT',
  'schema.sharedProps.textAlignVertical': '垂直对齐,缺省 TOP',
  'schema.sharedProps.textCase': '大小写变换,缺省 ORIGINAL',
  'schema.sharedProps.textDecoration': '装饰线,缺省 NONE',
  'schema.sharedProps.lineHeight':
    '行高;{unit:"AUTO"} 或 {value,unit:PIXELS|PERCENT}',
  'schema.sharedProps.letterSpacing': '字距;unit 为 PIXELS|PERCENT',
  'schema.sharedProps.textStyleId':
    '文本样式 id(团队库样式;平台无此能力时被忽略)',
  'schema.sharedProps.textTruncation':
    '文本截断(DISABLED=不截断,ENDING=末尾省略号截断),仅 Figma 生效',
  'schema.sharedProps.maxLines': '文本最大行数,仅 Figma 生效',
  'schema.sharedProps.paddingTop': '上内边距(px)',
  'schema.sharedProps.paddingRight': '右内边距(px)',
  'schema.sharedProps.paddingBottom': '下内边距(px)',
  'schema.sharedProps.paddingLeft': '左内边距(px)',
  'schema.sharedProps.primaryAxisSizingMode': '主轴尺寸模式:FIXED|AUTO',
  'schema.sharedProps.counterAxisSizingMode': '交叉轴尺寸模式:FIXED|AUTO',
  'schema.sharedProps.counterAxisAlignItems': '交叉轴对齐',
  'schema.sharedProps.layoutGrow': '父布局主轴剩余空间的伸展系数(0=不伸)',
  'schema.sharedProps.layoutAlign': '父布局交叉轴上的自对齐',
  'schema.sharedProps.fillStyleId':
    '填充样式 id(团队库样式;平台无此能力时被忽略)',
  'schema.sharedProps.effectStyleId':
    '效果样式 id(团队库样式;平台无此能力时被忽略)',
  'schema.sharedProps.effects':
    '效果列表(阴影/模糊,可多层叠加;整体替换,非合并)',
  'schema.sharedProps.vertical': '自动布局中的约束',
  'schema.sharedProps.clipsContent': '是否裁剪溢出内容',
  'schema.sharedProps.cornerSmoothing': '圆角平滑度 0-1',
  'schema.sharedProps.layoutGrids': '布局网格(参考线)',
  'schema.sharedProps.startingAngle': '起始角度(radians)',
  'schema.sharedProps.endingAngle': '结束角度(radians)',
  'schema.sharedProps.innerRadius2': '内半径(0-1 ratio)',
  'schema.sharedProps.innerRadius3': '环形路径参数(弧线),仅 ELLIPSE 节点生效',
  'schema.splitOps.ids': '目标节点 id 列表;缺省时作用于当前选中节点',
  'schema.splitOps.matchName':
    '按节点 name 精确过滤(精确等值,非模糊/包含),仅命中节点被修改',
  'schema.splitOps.ids2': '要删除的节点 id 列表;缺省时删除当前选中节点',
  'schema.splitOps.matchName2':
    '在 ids(或当前选中)范围内,仅删除 name 精确匹配的节点',
  'schema.splitOps.name': '组名',
  'schema.splitOps.paddingTop': '上内边距(px)',
  'schema.splitOps.paddingRight': '右内边距(px)',
  'schema.splitOps.paddingBottom': '下内边距(px)',
  'schema.splitOps.paddingLeft': '左内边距(px)',
  'schema.splitOps.primaryAxisSizingMode': '主轴尺寸模式:FIXED|AUTO',
  'schema.splitOps.counterAxisSizingMode': '交叉轴尺寸模式:FIXED|AUTO',
  'schema.splitOps.counterAxisAlignItems': '交叉轴对齐:MIN|MAX|CENTER',
  'schema.splitOps.ids3':
    '要清理的已损坏节点 id 列表;缺省时清理当前页全部损坏节点',
  'schema.splitOps.name2': '组件名称',
  'schema.splitOps.key': '团队库组件唯一标识 Key',
  'schema.splitOps.name3': '导入后的节点名称',
  'schema.splitOps.componentId': '目标组件(COMPONENT)节点 id',
  'schema.splitOps.name4': '变体集名称',
  'schema.splitOps.sourceId':
    '源实例 id,即先前 copy_overrides 返回的 snapshotId',
  'schema.splitOps.name5': '节点新名称',
  // ── MCP 工具面(注册期投影;源码里存键) ──
  'batch.title': '批量编排执行',
  'batch.followUp': '编排执行后复核画布结果',
  'createComponent.title': '建组件',
  'createComponent.description':
    '建组件(COMPONENT)并返回新 id。传 children 时一次建成带内容的组件(字段同 jsd_create_frame 的 children),可再传 width/height 定尺寸,不必再手工 reparent 搬子节点;不传 children 则是空壳,后续用 jsd_reparent_nodes 归组。原节点不会被固化也不会被改动 —— 组件一律新建(避免把已有节点卷进 wrapper)。变体命名用「属性=值, 属性=值」,变体属性用 jsd_set_instance_properties',
  'createComponent.description2': '调整组件尺寸 / 补齐填充、圆角、阴影',
  'createInstance.title': '生成组件实例',
  'createInstance.description': '设置实例的变体属性',
  'detachInstance.title': '取消实例链接',
  'detachInstance.description': '解链后自由编辑新节点样式',
  'importComponent.title': '从团队库导入组件',
  'importComponent.description': '为导入的组件生成实例',
  'swapComponent.title': '换绑组件',
  'swapComponent.description': '换绑后设置变体属性',
  'setInstanceProperties.title': '设置变体属性',
  'setInstanceProperties.description': '批量同步其他实例的覆盖',
  'combineAsVariants.title': '合并为变体集',
  'copyOverrides.title': '复制实例覆盖快照',
  'copyOverrides.description': '把快照套用到目标实例',
  'applyOverrides.title': '套用实例覆盖快照',
  'applyOverrides.description': '继续同步其他实例的覆盖',
  'syncOverrides.title': '同步实例覆盖',
  'syncOverrides.description': '复核同步后的实例',
  'createFrame.title': '创建 Frame 容器',
  'createFrame.description':
    '创建单个 FRAME 容器节点,入参只含 FRAME 字段:width/height 尺寸、layoutMode 自动布局(itemSpacing/padding*/主轴交叉轴尺寸对齐)与填充描边等视觉字段。本工具只建一个根 FRAME;children 只用于「容器 + 其直属子节点」这类小结构(子节点 x/y 相对父节点),**别把整屏的整棵树塞进一次 children**(易整批失败)—— 分层分批用 jsd_batch 编排,再用 jsd_reparent_nodes 逐层归组。auto-layout 前必须设 layoutMode=HORIZONTAL 或 VERTICAL(否则布局字段被忽略)。**同轴等距的兄弟元素一律用 auto-layout 建,不要手算坐标**(标签栏 / 胶囊组 / KPI 行 / 卡片头 / 列表行 / 整屏纵向分区都在此列;判据与两条落地路径见 skill://canvas/references/auto-layout.md)。**尺寸模式别写反**:开布局只给宽度、高度交给 AUTO 撑开,弹窗/卡片这类内容自适应的容器尤甚;只有屏根才两轴 FIXED(写死高度会留死白,写死高度不够会裁内容)。未显式传 fills 时引擎默认白底,透明容器传 fills:[{type:"SOLID",color:{r:0,g:0,b:0},opacity:0}]。**name 必传且语义化**(如「侧栏」「KPI-设备综合效率」),不传会落成引擎默认名 node。建多个根节点/复杂树用 jsd_batch 编排',
  'layoutHint.uniform':
    '检测到 {count} 个子节点沿 {mode} 方向等距排列(间距 {gap}px),但本容器没声明 layoutMode。这正是 auto-layout 的判据:设 layoutMode:{mode} + itemSpacing:{gap} 之后位置由布局接管,改文案或加一项都不必重算坐标(本条只是提示,创建已成功;判据与两条落地路径见 skill://canvas/references/auto-layout.md)',
  'structureHint.flatBatch':
    '本批有 {batchCount} 步把节点移入同一个父级({parentId})—— 这是「所有分区平铺在同一层」的形状。结构分层是通用纪律:屏 → 语义分区(状态栏 / 页头 / 主视觉 / 列表 / 运营位 / 底栏)→ 卡片内图元,每个元素归到语义容器,不许直挂屏根。配方见 skill://canvas/references/design-strategy.md(本条只是提示,移入已成功)',
  'structureHint.svgNoGroups':
    'SVG 源码里没有按语义切 <g id="...">(数到 {groupCount} 个)—— 导入后整张图落成不可拆的矢量,想单独调某一层只能回源重算重导。每个语义层切一个 <g>,id 用 ASCII 语义名(plot / grid / axis-x / series-<名> / legend);绘图区只在外层写一个 transform。配方见 skill://canvas/references/chart-by-code.md 第 5 节(本条只是提示,导入已成功)',
  'createRectangle.title': '创建矩形',
  'createRectangle.description':
    '创建单个 RECTANGLE 矩形节点,入参只含矩形字段:width/height 尺寸、cornerRadius 四角圆角与填充描边等视觉字段。本工具只建一个根矩形;children 只用于小结构(子节点 x/y 相对父节点)。**name 必传且语义化**(如「卡片底板」「图表-网格线」),不传会落成引擎默认名 node。建多个根节点/复杂树用 jsd_batch 编排',
  'createText.title': '创建文本',
  'createText.description':
    '创建单个 TEXT 文本节点,入参只含文本字段:characters 必填内容、fontSize/fontName 字号字体、对齐/自适应/大小写/装饰/行高/字距与填充描边。本工具只建一个根文本;children 只用于小结构(子节点 x/y 相对父节点)。字体先 jsd_list_fonts 取 fonts[] 里成对的 family + styles:family 用 fonts[].family 原样(如 SourceHanSansCN_family),style 用同一项的**全名**(如 SourceHanSansCN-Bold,不是简称 "Bold")——写错不报错、会静默退回默认字面,命中时结果 warnings 点名。长段落要换行:TEXT 缺省按内容撑开,显式 width 会被覆盖 —— 传 width + textAutoResize:"HEIGHT";要固定框尺寸传 "NONE"。**name 必传且语义化**(如「标题-近30天产出」「KPI 数值」),不传会落成引擎默认名 node。建多个根节点/复杂树用 jsd_batch 编排',
  'createEllipse.title': '创建椭圆',
  'createEllipse.description':
    '创建单个 ELLIPSE 椭圆节点,width/height 尺寸、arcData 环形参数(可画环)与填充描边等视觉字段。本工具只建一个根椭圆。**name 必传且语义化**,不传会落成引擎默认名 node。建多个根节点/复杂树用 jsd_batch 编排',
  'createLine.title': '创建线段',
  'createLine.description':
    '创建单个 LINE 线段节点,width/height 尺寸与描边等视觉字段。本工具只建一个根线段;短直线段建议 LINE+rotation 布局更稳定。横线/竖线可把一维传 0:引擎 resize 校验要求 >= 0.01,插件创建时把零轴抬到 0.01 过校验(视觉是直线,序列化回读该轴仍是 0);jsd_resize_node 改尺寸同样支持零轴。**name 必传且语义化**,不传会落成引擎默认名 node。建多个根节点/复杂树用 jsd_batch 编排',
  'createPolygon.title': '创建多边形',
  'createPolygon.description':
    '创建单个 POLYGON 多边形节点,pointCount 角点数必填(如 6=六边形)、cornerRadius 圆角与填充描边等视觉字段。本工具只建一个根多边形。**name 必传且语义化**,不传会落成引擎默认名 node。建多个根节点/复杂树用 jsd_batch 编排',
  'createStar.title': '创建星形',
  'createStar.description':
    '创建单个 STAR 星形节点,pointCount 角点数与 innerRadius 内半径比例必填(如 5 角、0.5)、cornerRadius 圆角与填充描边等视觉字段。本工具只建一个根星形。**name 必传且语义化**,不传会落成引擎默认名 node。建多个根节点/复杂树用 jsd_batch 编排',
  'createVector.title': '创建矢量',
  'createVector.description':
    '创建单个 VECTOR 矢量节点,vectorPaths 必填(每项含 SVG path data,如 "M0 0 L100 100")与填充描边等视觉字段。本工具只建一个根矢量。⚠ 已知平台缺陷:创建后 vectorPaths 偶发丢失/形变,短直线段建议改用 LINE+rotation 更稳定。**name 必传且语义化**,不传会落成引擎默认名 node。建多个根节点/复杂树用 jsd_batch 编排',
  'createGroup.title': '创建编组',
  'createGroup.description':
    '创建单个 GROUP 编组节点,children 必填且至少 2 个子节点(内部用 Frame 实现),可带 auto-layout 布局字段(layoutMode/itemSpacing/padding*)。本工具只建一个根编组;要固定坐标的根层级用 placement 控制。**name 必传且语义化**,不传会落成引擎默认名 node。建多个根节点/复杂树用 jsd_batch 编排',
  'createBooleanOperation.title': '创建布尔运算节点',
  'createSvg.title': '导入 SVG',
  // 本键由 0016 的规则承载「图表路由」:工具的 description 必须整体是一个键
  // (注册期 t() 只对整串查表),拼接出来的串查不到、会原样下发。
  'createSvg.description':
    '将 SVG 直接导入画布为可编辑图层(createNodeFromSvg 原生解析,保留路径/渐变/描边)。来源二选一:svg(内联字符串)或 svgPath(本地 .svg 文件路径,由后台服务读盘)。**图表 / 数据可视化一律走 svgPath**(折线图、柱状图、饼图 / 环形图、散点图、雷达图、面积图、仪表盘、看板、桑基图……):没有内置图表工具 —— 先自己写脚本把 SVG 算好、落到本地文件,再传路径。引擎硬约束(违反会静默画不出来):根元素必须带 xmlns 与显式 width/height/viewBox;颜色只写 hex;不引外链图片/字体/script;曲线用 C/Q 自己近似,不要用 A 指令;画布 ≤2000×2000;按语义层切 `<g id>`(一层不套等于没分组),绘图区只在外层写一个 transform。动手前先 ReadMcpResource 读配方 skill://canvas/references/chart-by-code.md —— 内含零依赖示例、配色字号口径、导入后回读层级与导图验收清单。建多个根节点/复杂树用 jsd_batch 编排',
  'createIcon.title': '插入内置图标',
  'htmlToDesign.title': 'HTML 转设计节点',
  'htmlToDesign.description':
    '将 HTML 片段转成矢量图层(SVG 保真,忽略复杂样式);需要逐节点可编辑的结构时改用 jsd_create_rectangle / jsd_create_text 等手工搭建后再 jsd_batch 编排',
  'manageNodes.title': '节点结构操作(聚合)',
  'manageNodes.followUp': '结构改完后设置容器自动布局',
  'manageComponents.title': '组件与实例操作(聚合)',
  'manageComponents.description':
    '按 op 分发的组件/实例操作聚合入口:create_component|create_instance|detach_instance|import_component|swap_component|set_instance_properties|combine_as_variants|copy_overrides|apply_overrides|sync_overrides。单次单操作请优先用对应小工具:jsd_create_component / jsd_create_instance / jsd_detach_instance / jsd_import_component / jsd_swap_component / jsd_set_instance_properties / jsd_combine_as_variants / jsd_copy_overrides / jsd_apply_overrides / jsd_sync_overrides(描述含平台缺陷与正确流程)。节点结构操作用 jsd_manage_nodes,两工具 op 不通用',
  'manageComponents.description2': '组件/实例改完后设置变体属性',
  'find.title': '查找节点',
  'find.description': '把查到的节点设为当前选中,便于后续修改/删除',
  'selectNodes.title': '设置画布选中',
  'selectNodes.description': '选中后移动/调整选中节点',
  'deleteNode.title': '删除节点',
  'deleteNode.description': '删除后复核剩余节点',
  'cloneNode.title': '复制节点',
  'cloneNode.description': '把副本移到目标位置',
  'groupNodes.title': '编组节点',
  'groupNodes.description': '编组后设置组内自动布局',
  'ungroupNodes.title': '解组节点',
  'ungroupNodes.description': '解组后调整子节点位置',
  'flattenNodes.title': '合并为矢量',
  'flattenNodes.description': '烘焙后设置合并图形的填充',
  'outlineStroke.title': '描边转轮廓',
  'outlineStroke.description': '调整新轮廓的描边',
  'reparentNodes.title': '移动节点到父节点下',
  'reparentNodes.description': '移动后按需微调新父下的 x/y(绝对位置已自动保持)',
  'repairNodes.title': '清理损坏节点',
  'repairNodes.description': '清理后复核页面节点状态',
  'platformOp.title': '平台特有操作',
  'platformOp.description':
    '执行平台特有能力(Figma:变量/本地样式/组件属性;MasterGo:变量读写/组件属性/集合级变体管理等)。CRITICAL: 不要凭空猜测 op 名与参数——先 jsd_ping 读 platformOps 名单(含每个 op 的参数形状说明)与 capabilities,再按名单里的名字调用;平台不支持或 op 名写错时返回错误并列出当前平台支持的 op',
  'platformOp.description2': '复核平台操作在画布上的效果',
  'prompt.htmlToDesign.title': 'HTML 转设计稿',
  'prompt.htmlToDesign.description':
    '把一段 HTML 转为画布节点,含保真度取舍说明',
  'prompt.iconGrid.title': '图标网格',
  'prompt.iconGrid.description': '批量插入 Lucide 图标并排成自动布局网格',
  'prompt.scriptOps.title': '脚本化批量调用',
  'prompt.chartByCode.title': '代码画图表 / 数据可视化',
  'prompt.chartByCode.description':
    '画图表 / 数据可视化的主路径:折线图、柱状图、饼图 / 环形图、散点图、雷达图、面积图、仪表盘、看板等任意图表,都由自己写代码算几何、落盘 SVG,再经 jsd_create_svg 导入(含零依赖示例与引擎侧硬约束)',
  'prompt.designStrategy.title': '设计策略总纲',
  'prompt.autoLayout.title': '自动布局',
  'prompt.autoLayout.description':
    '容器该不该上 auto-layout(判据 + 易漏分区)、方向自判(按直属子项流动轴,不写死 HORIZONTAL/VERTICAL)、两条落地路径、平台硬约束与验收坑',
  'prompt.textReplace.title': '文本批量替换策略',
  'prompt.variantSync.title': '同类实例样式批量同步',
  'prompt.variableBinding.title': '变量绑定与批量套用',
  'prompt.variantSet.title': '变体集构建',
  'prompt.componentProperty.title': '组件属性定义与设值',
  'setFillColor.title': '设置填充',
  'setFillColor.followUp': '接着设置描边',
  'setStroke.title': '设置描边',
  'setStroke.description': '接着设置填充',
  'setCornerRadius.title': '设置圆角',
  'setCornerRadius.description': '接着设置阴影/模糊效果',
  'setText.title': '修改文本',
  'setText.followUp': '给文本起个语义名称',
  'moveNode.title': '移动节点',
  'moveNode.description': '接着调整尺寸',
  'resizeNode.title': '调整节点尺寸',
  'resizeNode.description': '接着设置可见性/锁定',
  'setLayout.title': '设置自动布局',
  'setLayout.description': '把子节点移入容器完成排布',
  'setEffects.title': '设置效果与高级属性',
  'setEffects.description': '接着设置可见性/锁定',
  'setVisibility.title': '设置可见性与锁定',
  'setVisibility.description': '复核改动后的画布选中',
  'renameNode.title': '重命名节点',
  'renameNode.description': '接着改文本内容/排版',
  'setShape.title': '设置多边形/星形形状',
  'setShape.description': '接着设置填充',
  'export.title': '导出节点为图片',
  'export.description':
    '导出节点为 PNG/JPG/SVG/PDF;ids 为必填数组(单节点也写成 ids:["123:456"],不是 nodeId),savePath 落盘与 includeDataUrl 返回 base64 可并存。注意:单张图片超过内联上限(默认 512KB)时不返回 base64,自动落盘并返回路径引用,避免撑爆会话内存。完整字段见 inputSchema。',
  'export.description2': '导出后用该图片填充到节点',
  'fillImage.title': '本地图片填充节点',
  'fillImage.description': '读取本地图片文件填充到指定节点(IMAGE fill)',
  'fillImage.description2': '复核图片填充效果',
  'listFonts.title': '列出可用字体',
  'listFonts.description': '用列出的字体设置文本',
  'createStyle.title': '建本地样式',
  'createStyle.description':
    '从**某个既有节点**建一条本地样式,回它的 id 与名称。类别取八项(三家 `StyleType` 的并集):PAINT / TEXT / EFFECT / GRID **三家都有**;STROKE_WIDTH / CORNER_RADIUS / PADDING / SPACING **只 MasterGo 能建**—— 另两家没有对应工厂,传过去会被写前点名拒并列出本平台可建的类别(不会静默建成别的类)。三平台唯一都成立的形状是「从这个图层抄」:MG 原生即 `createFillStyle({name, id: 图层id})` 由引擎取该图层样式;Figma / jsDesign 是无参工厂建空样式后由本仓把该节点的 fills / effects / layoutGrids / 文本排版字段灌进去。PAINT 类 fills 优先,节点只有描边时退到 strokes(所以一个既无填充又无描边的节点会直接报错,而不是建出一条空样式)。取值字段为混值(mixed,如一段文字用了两个字体)时报错并说明先用 jsd_set_text 统一;新那四类同此纪律 —— 间距类要那节点是自动布局容器、圆角类要它真有圆角,读不出值就在发起请求前拦下。建完就用 id 绑:`jsd_set_fill_color` 的 fillStyleId / `jsd_set_stroke` 的 strokeStyleId / `jsd_set_text` 的 textStyleId / `jsd_set_effects` 的 effectStyleId —— 之后改这条样式全档跟随,这是没有变量面的平台(即时设计)上做统一色板的正路。清单读 `jsd://styles`(只读资源)——⚠ 未声明 `styleEnumeration` 的平台该清单**恒空**(当前三家都已声明,即时设计自 2026-10-15 起也列得出,见 dec e1e66f0a):那不等于没有样式,而是列不出来,已有样式的 id 只能从正用着它的节点上读 `*StyleId`,新建的把回包 id **自己记账**',
  'createStyle.followUp': '把新建的样式 id 绑到节点上',
  'deleteStyle.title': '删本地样式',
  'deleteStyle.description':
    '按 id 删本地样式(ids 一次传多个),逐条删:单条 id 不存在只进结果的 failed 并给原因,不影响其余条。id 取自 jsd://styles 或 jsd_get_page 的 assets.styles(⚠ 未声明 styleEnumeration 的平台两处恒空,那里只能从节点的 *StyleId 或自己记的账里拿)—— **按 id 不按名**,同名样式可以并存,按名删等于猜要删哪一条。与 `jsd_create_style` 成对(建 / 撤都有入口才谈得上试错),变量的删除在平台 op `figma_variables_remove`(Figma)/ `mg_variables_remove`(MasterGo)。⚠ 被节点引用中的样式删掉后,那些节点的 `*StyleId` 会指向不存在的样式(引擎不级联清理),要一起改就先把它们重绑到别的样式;本仓没有「谁在用这条样式」的反查入口(Figma 有 `getStyleConsumersAsync`,未接)',
  'deleteStyle.followUp': '删完读一次样式清单确认',
  'resources.title': '画布当前选中',
  'resources.title2': '可用字体列表',
  'resources.title3': '本地样式列表',
  'resources.title4': '当前页概览:第一层节点 + 可复用资源清单',
  'resources.title5': '节点详情',
  'resources.title6': '平台状态与能力表',
  'resources.title7': '配方索引',
  'resources.title8': '配方正文',
  'ping.followUp':
    '连接确认后读取当前选中。**创作类任务在第 0 步读配方**(宿主普遍不注入 server instructions,mcp.instructions 读了也白读,只能自己主动读):先 ReadMcpResource skill://canvas/SKILL.md 拿索引 —— 画图表 / 数据可视化读 skill://canvas/references/chart-by-code.md,从零设计整页读 skill://canvas/references/design-strategy.md + skill://canvas/references/auto-layout.md,批量改造读 skill://canvas/references/script-ops.md。跳过配方的代价可量化:实测一次整屏任务全程单步调用、没读任何配方,38 个节点全平铺在一层,返工多轮',
  'getSelection.title': '读取画布选中',
  'getSelection.description':
    '获取画布当前选中节点的序列化树(名称/类型/尺寸/位置/填充/子结构);depth 控制层级深度,默认 2。⚠ 每个节点带 z = 在父级 children 里的下标 = 绘制顺序(0 = 最底层,越大越靠上),判断遮挡读 z 即可',
  'getSelection.description2': '在选中范围内继续精确查找节点',
  'getPage.title': '当前页概览:第一层节点 + 可复用资源清单',
  'getPage.description':
    '**当前页**的两段只读概览。①nodes:**当前页第一层**节点的几何(id/名称/类型/宽高/x/y,不递归);②assets:可复用资源清单 —— summary 给四类计数,components 组件、variants 变体集(带「维度→可选值」)、styles 样式(PAINT/TEXT/EFFECT/GRID,带 type)、variables 变量,每项含 id 与名称。范围说明:**样式与变量是文档级**(引擎的枚举 API 本身就是文档级,与页面无关);组件与变体按平台 —— 能读非当前页的平台覆盖全文档,读不到的(即时设计/MasterGo)**只覆盖当前页**,note 会点名。**设计前的第一步就是读这里:命中同名/同用途的组件、变体取值、样式、变量一律复用,禁止新建重复件**;清单里没有才允许新建。某个面在本平台未声明对应能力时该项为空数组,不报错(即时设计无变量面、列不出样式清单);成因写在 note 里 —— **空数组 ≠ 文档里没有**;变体的 properties 键在平台读不到该字段时整体省略(不写成空对象)。从头设计整页前先读这里,看页面已有内容与能复用的件;资源的细节按 id 走 jsd_find。另附 pages:各页名与顶层节点数;dynamic-page 平台首次读取会全量加载文档并在 note 点名成本(幂等,再次调用不再加载)。读不到非当前页的平台(即时设计/MasterGo)资源清单与 pages 只覆盖当前页,note 同样点名 —— 那不等于文档只有一页',
  'getPage.followUp':
    '按 id 读取具体节点的序列化结构;要跨页查找传 scope=document',
  'mcp.instructions':
    '操作设计画布前按任务读取 skill://canvas/SKILL.md 及对应附录；无法读取 skill 时使用 jsd_list_prompts/jsd_get_prompt 或 jsd://recipes。创作先读 jsd_get_page，复用已有组件、变体、样式和变量。按语义容器分层，重复结构复用组件；同轴等距内容用 auto-layout。根节点坐标受 placement 控制，指定坐标用 manual；子坐标相对父级，布局子项由布局接管。画布请求串行；同值批改用 ids，多步用 jsd_batch（最多 50 步，占位符仅本批有效）。recursive 只改后代，includeSelf=true 才包括容器自身。字体使用 jsd_list_fonts 返回的成对原值。读 warnings，关键字段独立回读，视觉改动导出目检。超时可能已经写入，先核实再重试；只改用户指定范围。',
  'ping.title': '检查{client}插件连接',
  'batch.description':
    '顺序编排多个工具步骤。calls 与 callsFile 二选一，单批最多 50 步；文件须是服务进程可读的绝对路径。步骤用 id/tool/args，后续参数可引用 {{步骤id.created[0].id}} 等返回路径，占位符仅本批有效；已有资源可用 {{@comp:名称}} / {{@var:名称}}。同值属性批改优先单工具 ids，不同值或多工具依赖再用 batch。精简档未公开的能力先用 jsd_describe_tools 查询完整 schema，再放入本批执行；不支持任意未知工具。默认遇错停止，可按 stopOnError/continueOnError 控制执行失败；计划错误仍停止。批次不是事务，失败前写入可能保留；超时先回读，不盲目重放。回显会裁剪子树与样式字段，完整结果按 path/line 读取；核实属性需独立 jsd_find，视觉改动另导图。checkDrift 默认开启，结构操作发现兄弟节点漂移会给 warnings 与原坐标；false 仅关闭本次复核。完整流程见 skill://canvas/references/script-ops.md,配方索引见 jsd://recipes。',
  'manageNodes.description':
    "按 op 分发的节点结构操作聚合入口:select|remove|clone|group|ungroup|flatten|outline_stroke|reparent|repair。单次单操作请优先用对应小工具:jsd_select_nodes / jsd_delete_node / jsd_clone_node / jsd_group_nodes / jsd_ungroup_nodes / jsd_flatten_nodes / jsd_outline_stroke / jsd_reparent_nodes / jsd_repair_nodes(描述含平台缺陷与正确流程)。**但连续 ≥2 次同类调用就是改批量的信号**:结构一致的重复步骤(第 N 行 / 第 N 张卡)一律进 jsd_batch 或 callsFile,别一个个单步调 —— 一次 MCP 往返 3~10s,整屏几十次单步会白耗十分钟。属性修改用 jsd_set_* 系列(含 jsd_set_shape);组件/实例操作用 jsd_manage_components 或 jsd_create_component / jsd_sync_overrides 等,两工具 op 不通用。\\n各 op 的返回键(在 jsd_batch 里用占位符引用时才不会写错,写错会中止整批):select→selected[](id 字符串)、remove→removed[](id 字符串)、clone/outline_stroke→created[](节点**数组**)、group/flatten→created(节点**单对象**:这两个 op 内部走的就是 jsd_group_nodes / jsd_flatten_nodes 那条路)、ungroup→ungrouped[](id 字符串)、reparent→moved[](同时附 updated[],两者同一份数组)、repair→cleaned[](id 字符串)。id 字符串数组取 {{步骤id.selected[0]}},节点数组取 {{步骤id.created[0].id}},节点单对象取 {{步骤id.created.id}}(单对象与单元素数组互认:{{步骤id.created[0].id}} 与 {{步骤id.created.id}} 都能解析;多元素数组直接取 .字段 仍中止)。'",
  'createBooleanOperation.description':
    '创建单个 BOOLEAN_OPERATION 布尔运算节点,booleanOperation 运算方式({ops})与 children 必填且至少 2 个合并子节点。本工具只建一个根布尔节点。**name 必传且语义化**,不传会落成引擎默认名 node。建多个根节点/复杂树用 jsd_batch 编排',
  'setFillColor.description':
    '设置填充色/渐变(fills 为 Paint 数组,整体替换非合并,需保留的现有填充项要一并传入)、混合模式与团队库填充样式。{warn}',
  'setText.description':
    '修改文本(仅 TEXT 节点生效):**内容与排版** characters/fontSize/fontName/对齐/自适应/大小写/装饰/行高/字距、**颜色** fills/fillStyleId/blendMode、**尺寸** width/height(与 textAutoResize 搭配),以及 Figma 的截断与最大行数;位置 x/y 不在此工具,走 jsd_move_node / jsd_resize_node。字体先 jsd_list_fonts 取 fonts[] 里成对的 family + styles:family 用 fonts[].family 原样,style 用同一项的**全名**(如 SourceHanSansCN-Bold,不是简称 "Bold")——写错不报错、会静默退回默认字面,结果 warnings 会点名。要换行须 width + textAutoResize:"HEIGHT"(缺省 WIDTH_AND_HEIGHT 会按内容撑开;只给 width 不给 autoResize 会被引擎置成 NONE、高度不随内容重算 —— 这类「高度没跟着内容走」的文本,**重设一次 characters 就触发重排**(实测固定宽 200、height 回读 15 的长文本,重设后回读 82)。{warn};characters 内容覆盖在实例内也是正常生效的',
  'ping.description':
    '检查插件是否在线(需先在{client}(即时设计或 Figma)中运行该插件并保持运行)。返回三个能力表:coreCapabilities 为核心能力(create/modify/structure/component/export/image,两平台一致);capabilities 只列平台差异超集(如 variables/componentProperties/textTruncation),即时设计通常只有 styles,Figma 还会有 variables/componentProperties 等;platformOps 列当前平台可用的特有操作(名/标题/参数说明),调 jsd_platform_op 前先读它。回包会被 daemon 缓存,后续可直接读 jsd://platform/state(不必重复 ping)',
  'header.more': '更多设置',
  'menu.telemetry': '错误上报',
  'menu.cameraLock': '相机锁',
  'menu.theme': '主题',
  'menu.locale': '语言',
  'telemetry.title': '错误上报',
  'telemetry.body': '为了更好地更新迭代产品,开启后会记录插件与服务的报错信息。',
  'telemetry.item.error': '报错内容与堆栈',
  'telemetry.item.identity': '匿名安装标识(不采集文档内容与个人信息)',
  'telemetry.item.version': '插件与服务版本',
  'telemetry.state.on': '已开启',
  'telemetry.state.off': '未开启',
  'telemetry.enable': '同意并开启',
  'telemetry.decline': '暂不开启',
  'telemetry.disable': '关闭上报',
} as const;
