import type { MESSAGES_ZH_CN } from './messages.zh-CN';

/**
 * English catalog.
 *
 * **两类状态**:已译给字符串;**未译给 `null`** —— 这是显式数据,不是漏项。
 *
 * 为什么允许未译:迁移是逐批的(见 0016 的 B1/B3/B4),而"键集必须一致"这条约束
 * 要一直成立 —— 若用空串表示未译,`t()` 会返回空串(界面上看起来是"渲染坏了"),
 * 且"值非空"这条门禁会一直红着,没人能在红 CI 上继续干活。`null` 的语义是
 * "回落到中文"(`createT` 里 `?? zh 表`),未译清单则由 `tests/i18n.test.ts` 的
 * 棘轮守着(数量只能减)。
 *
 * 键的 `satisfies` 约束不变:键必须与 `MESSAGES_ZH_CN` **完全一致** ——
 * 漏键/多键都在编译期报错。占位符一致性由测试守(类型系统看不到 `{}` 里的名字)。
 */
export const MESSAGES_EN = {
  'platform.jsdesign': 'jsDesign',
  'platform.figma': 'Figma',
  'platform.mastergo': 'MasterGo',

  'capability.core.create': 'Create',
  'capability.core.modify': 'Modify',
  'capability.core.structure': 'Structure',
  'capability.core.component': 'Component',
  'capability.core.export': 'Export',
  'capability.core.image': 'Image fill',
  'capability.host.styles': 'Local styles',
  'capability.host.textTruncation': 'Text truncation',
  'capability.host.componentProperties': 'Component properties',
  'capability.host.variables': 'Variables',
  'capability.host.platformOps': 'Platform-specific ops',
  'capability.host.inPlaceVariants': 'In-place variants',

  'locale.system': 'System',
  'locale.zh-CN': '中文',
  'locale.en': 'English',
  'locale.abbr.zh-CN': '中',
  'locale.abbr.en': 'EN',
  'locale.menu': 'Language',
  'locale.title.followSystem': 'Language: follow system (currently {locale})',
  'locale.title.fixed': 'Language: {locale}',

  'status.connected.label': 'Connected',
  'status.connected.title':
    'Service is online; plugin and AI session are connected',
  'status.connecting.label': 'Connecting…',
  'status.connecting.title':
    'Connected to the background service; waiting for it to confirm this channel',
  'status.waiting.label': 'Waiting',
  'status.waiting.title':
    'No manual action needed while the service is offline — an AI call starts it',
  'status.superseded.label': 'Taken over',
  'status.superseded.title':
    'Another plugin panel holds the channel; click "Reclaim" to switch back to this panel',

  'header.retry': 'Retry',
  'header.retry.title':
    'Reconnect to the background service now instead of waiting for the backoff',
  'header.reclaim': 'Reclaim',
  'header.reclaim.title': 'Reclaim the channel from the other plugin panel',
  'header.meta': '{platform} · :{port}',
  'header.meta.portOnly': ':{port}',
  'header.meta.title':
    'Platform {platform} · MCP bridge port {port} (override with TEXT_TO_DESIGN_MCP_PORT)',
  'header.meta.titleUnknown':
    'Platform unknown · MCP bridge port {port} (override with TEXT_TO_DESIGN_MCP_PORT)',

  'conn.connected':
    'Connected. Select nodes on the canvas, click "Copy", then paste into your AI assistant — e.g. "make me another card in this node style"',
  'conn.superseded':
    'Another plugin panel has taken over this channel (only one panel is served at a time), so auto-reconnect has stopped. Click "Reclaim" next to the status badge to switch back to this panel.',
  'conn.disconnected.title': 'Not connected to the background service',
  'conn.disconnected.tutorial': 'Install guide',
  'conn.copyAi': '① Copy prompt for AI',
  'conn.copyDaemon': '② Copy start command',
  'conn.copied': '✓ Copied',
  'conn.copyAi.hint':
    'Send it to your AI so it calls jsd_ping to wake the service',
  'conn.daemon.note':
    'Running it in a local terminal keeps the service alive until the next reboot; running it again is safe (an existing instance is skipped).',
  'conn.announce.connected': 'Connected to the background service',
  'conn.announce.connecting': 'Connecting to the background service',
  'conn.announce.superseded': 'Another plugin panel took over the channel',
  'conn.announce.disconnected': 'Not connected to the background service',
  'conn.wakeCmd':
    'Please connect me to the text-to-design background service:\n\n1. If the MCP server is not registered yet: register a stdio MCP server the native way for your tool,\n   with the command `npx -y text-to-design-mcp@latest` (no manual install; npx fetches and runs it).\n\n2. Then call jsd_ping — that wakes the background daemon (starting it if needed).\n   If it reports "plugin not connected", tell me to run the text-to-design plugin inside my design app.',

  'selection.title': 'Selected nodes',
  'selection.badge': '{count} nodes · {size} serialized',
  'selection.copy': 'Copy',
  'selection.copied': '✓',
  'selection.expand': 'Expand node list',
  'selection.collapse': 'Collapse node list',
  'selection.empty.title': 'No nodes selected',
  'selection.empty.hint':
    'Select nodes on the canvas and they show up here, ready to copy',

  'capability.card.title': 'Capabilities',
  'capability.card.missing': 'Capabilities unavailable (plugin not connected)',
  'capability.card.badgeTitle':
    'Core capability count · platform-specific capabilities available · platform op count',
  'capability.card.badge': 'core {core} · platform {host}/{total} · op {ops}',
  'capability.card.expand': 'Expand',
  'capability.card.collapse': 'Collapse',
  'capability.card.coreSection': 'Core capabilities (same on both platforms)',
  'capability.card.hostSection': 'Platform differences',
  'capability.card.opTitle': '{op}: supported on the current platform',
  'capability.card.opTitleOff': '{op}: not supported on the current platform',
  'capability.card.opsSection': 'Platform-specific ops',
  'capability.card.refresh': 'Refresh',
  'capability.card.noOps': 'No platform-specific ops on this platform',

  'log.trigger': 'Log',
  'log.trigger.title': 'Log: MCP calls and connection events',
  'log.trigger.unread': 'Log, {count} new errors',
  'log.trigger.unit': 'errors',
  'log.trigger.announce': '{count} new errors',
  'log.drawer.title': 'Log',
  'log.drawer.count': '{shown} / {total}',
  'log.drawer.clear': 'Clear',
  'log.drawer.close': 'Close log',
  'log.drawer.filter.all': 'All',
  'log.drawer.filter.info': 'Info+',
  'log.drawer.filter.warn': 'Warn+',
  'log.drawer.filter.error': 'Error',
  'log.drawer.empty':
    'No log yet. MCP calls and connection events are recorded here.',
  'log.drawer.emptyFiltered':
    'Nothing at level "{filter}" — switch to "All" for the full record.',
  'log.drawer.copy': 'Copy',
  'log.drawer.newCount': '↓ {count} new entries',

  'bridge.log.superseded':
    'Another plugin panel took over the channel; auto-reconnect stopped (click "Reclaim" in the panel header to switch back)',
  'bridge.log.confirmed':
    'Service confirmed the connection (version {version})',
  'bridge.log.handshakeTimeout':
    'WS handshake timed out ({ms}ms), giving up on this connection: {port}',
  'bridge.log.serverConnected':
    'MCP server connected, waiting for service confirmation: ws://localhost:{port}',
  'bridge.log.confirmTimeout':
    'Service confirmation timed out, closing: {port}',
  'bridge.log.closed': 'Connection closed: {port}',
  'bridge.log.stale':
    'Service confirmation expired (no heartbeat for {ms}ms), closing: {port}',
  'bridge.log.wsFailed': 'Failed to handle WS message: {message}',
  'bridge.log.recvRequest': 'Server request received: {method}',
  'bridge.log.recvResponse': 'Server response received (ignored): {id}',
  'bridge.log.forwardTimeout': 'Forwarding to plugin timed out: {method}',
  'bridge.log.pluginTimeout': 'Plugin response timed out',
  'bridge.log.ignoreUnknown': 'Ignoring unknown plugin message: {type}',
  'bridge.log.codeFailed': 'Failed to handle code message: {message}',
  'bridge.log.sendFailed':
    'Failed to send response (server not connected): {id}',
  'bridge.log.manualClose': 'Disconnected manually',
  'bridge.log.capabilityMissing':
    'Capability reply malformed (missing platform)',
  'bridge.log.capabilityFailed': 'Failed to fetch capabilities: {message}',
  'bridge.log.pingOk': 'Plugin ping succeeded: {data}',
  'bridge.log.pingFailed': 'Plugin ping failed: {message}',
  'bridge.error.useBridge': 'useBridge must be used inside <BridgeProvider>',
  // ── zod .describe 字段说明(见 0016:schema 存键,边界投影成文案) ──
  'schema.base.r': 'Red channel, 0-1 (0=none, 1=full), e.g. 1 for pure red',
  'schema.base.g': 'Green channel, 0-1',
  'schema.base.b': 'Blue channel, 0-1',
  'schema.base.a': 'Opacity 0-1 (0=transparent, 1=opaque), defaults to 1',
  'schema.base.color': 'Color of this stop (with alpha)',
  'schema.base.position': 'Stop position, 0-1 (0=start, 1=end)',
  'schema.base.transformSchema': 'Transform matrix [[a,b,tx],[c,d,ty]]',
  'schema.base.type': 'Fill type: solid',
  'schema.base.opacity': 'Opacity 0-1, default 1',
  'schema.base.visible': 'Whether visible, default true',
  'schema.base.blendMode': 'Blend mode, default NORMAL',
  'schema.base.blendMode2': 'Solid fill (SOLID): {color:{r,g,b}}',
  'schema.base.type2': 'Fill type: linear gradient',
  'schema.base.gradientStops':
    'Gradient stop array (at least 2, defining color and position)',
  'schema.base.gradientTransform':
    'Linear gradient (GRADIENT_LINEAR): transitions along a straight line',
  'schema.base.type3': 'Fill type: radial gradient',
  'schema.base.gradientStops2':
    'Gradient stop array (at least 2, defining color and position)',
  'schema.base.gradientTransform2':
    'Radial gradient (GRADIENT_RADIAL): radiating outwards from the centre',
  'schema.base.type4': 'Fill type: angular gradient',
  'schema.base.gradientStops3':
    'Gradient stop array (at least 2, defining color and position)',
  'schema.base.gradientTransform3':
    'Angular gradient (GRADIENT_ANGULAR): transitions around the circumference',
  'schema.base.type5': 'Fill type: image fill',
  'schema.base.imageHash': 'Image asset hash (injected by jsd_fill_image etc.)',
  'schema.base.scaleMode': 'Image scale mode: FIT | FILL | CROP | TILE',
  'schema.base.scaleMode2':
    'Image fill (IMAGE): references the image by imageHash',
  'schema.base.type6': 'Effect type: drop shadow (cast outside the node)',
  'schema.base.color2': 'Shadow color (with alpha)',
  'schema.base.x': 'Horizontal offset (px), positive = right',
  'schema.base.y': 'Vertical offset (px), positive = down',
  'schema.base.y2': 'Shadow offset vector (px)',
  'schema.base.radius': 'Blur radius (px), >=0',
  'schema.base.spread':
    'Spread (px), positive expands and negative shrinks the shadow, default 0',
  'schema.base.visible2': 'Whether visible, default true',
  'schema.base.blendMode3': 'Blend mode, default NORMAL',
  'schema.base.showShadowBehindNode':
    'Whether the shadow is drawn behind the node (otherwise under its content), default true',
  'schema.base.showShadowBehindNode2':
    'Drop shadow (DROP_SHADOW): a shadow cast outside the node',
  'schema.base.type7': 'Effect type: inner shadow (cast inside the node)',
  'schema.base.color3': 'Shadow color (with alpha)',
  'schema.base.x2': 'Horizontal offset (px), positive = right',
  'schema.base.y3': 'Vertical offset (px), positive = down',
  'schema.base.y4': 'Shadow offset vector (px)',
  'schema.base.radius2': 'Blur radius (px), >=0',
  'schema.base.spread2':
    'Spread (px), positive expands and negative shrinks, default 0',
  'schema.base.visible3': 'Whether visible, default true',
  'schema.base.blendMode4': 'Blend mode, default NORMAL',
  'schema.base.blendMode5':
    'Inner shadow (INNER_SHADOW): a shadow cast inside the node',
  'schema.base.type8': 'Effect type: layer blur (blurs the whole node itself)',
  'schema.base.radius3': 'Blur radius (px), >=0',
  'schema.base.visible4': 'Whether visible, default true',
  'schema.base.visible5': 'Layer blur (LAYER_BLUR): blurs the node itself',
  'schema.base.type9':
    'Effect type: background blur (blurs what is behind the node)',
  'schema.base.radius4': 'Blur radius (px), >=0',
  'schema.base.visible6': 'Whether visible, default true',
  'schema.base.visible7':
    'Background blur (BACKGROUND_BLUR): blurs the content behind the node',
  'schema.base.pattern': 'Grid type: ROWS | COLUMNS | GRID',
  'schema.base.alignment': 'Alignment: MIN | MAX | CENTER | STRETCH',
  'schema.base.sectionSize': 'Section size (px)',
  'schema.base.gutterSize': 'Gutter size (px)',
  'schema.base.offset': 'Offset (px)',
  'schema.base.windingRule':
    'Winding rule: NONZERO | EVENODD | NONE, default NONZERO',
  'schema.base.value': 'Line height value (px)',
  'schema.base.unit': 'Unit: PIXELS = fixed pixels',
  'schema.base.value2': 'Line height value (percentage)',
  'schema.base.unit2': 'Unit: PERCENT = percentage',
  'schema.base.unit3': 'Unit: AUTO = automatic line height',
  'schema.base.unit4': 'Automatic line height: {unit: "AUTO"}, no value needed',
  'schema.base.unit5': 'Unit: PIXELS = pixels | PERCENT = percentage',
  'schema.batch.calls': 'Step list, executed in array order',
  'schema.batch.ok':
    'True when every step ran and succeeded (executed < total means it stopped halfway)',
  'schema.batch.executed': 'Number of steps that actually produced a result',
  'schema.batch.total': 'Total number of planned steps',
  'schema.batch.error': 'Failure reason (human-readable text)',
  'schema.batch.error2': 'Id of the step that failed',
  'schema.executeOp.depth': 'Serialization depth',
  'schema.executeSchemas.type': 'Child node type',
  'schema.executeSchemas.x': 'X relative to the parent (px)',
  'schema.executeSchemas.y': 'Y relative to the parent (px)',
  'schema.executeSchemas.x2': 'X relative to the parent (px)',
  'schema.executeSchemas.y2': 'Y relative to the parent (px)',
  'schema.executeSchemas.width': 'Width (px)',
  'schema.executeSchemas.height': 'Height (px)',
  'schema.executeSchemas.rotation': 'Rotation angle (deg)',
  'schema.executeSchemas.opacity': 'Opacity 0-1',
  'schema.executeSchemas.strokes': 'Stroke list (Paint array)',
  'schema.executeSchemas.strokeWeight': 'Stroke weight (px)',
  'schema.executeSchemas.strokeTopWeight': 'Top stroke weight (px)',
  'schema.executeSchemas.strokeBottomWeight': 'Bottom stroke weight (px)',
  'schema.executeSchemas.strokeLeftWeight': 'Left stroke weight (px)',
  'schema.executeSchemas.strokeRightWeight': 'Right stroke weight (px)',
  'schema.executeSchemas.strokeAlign':
    'Stroke alignment: CENTER | INSIDE | OUTSIDE',
  'schema.executeSchemas.strokeCap': 'Stroke cap: NONE | ROUND | SQUARE',
  'schema.executeSchemas.strokeJoin': 'Stroke join: MITER | BEVEL | ROUND',
  'schema.executeSchemas.dashPattern': 'Dash segment array, e.g. [4,4]',
  'schema.executeSchemas.effects': 'Effect list (shadow/blur, stackable)',
  'schema.executeSchemas.vertical': 'Constraint inside auto-layout',
  'schema.executeSchemas.clipsContent':
    'Whether overflowing content is clipped',
  'schema.executeSchemas.cornerSmoothing': 'Corner smoothing 0-1',
  'schema.executeSchemas.layoutGrids': 'Layout grids (guides)',
  'schema.executeSchemas.cornerRadius':
    'Corner radius (px), same on all four corners',
  'schema.executeSchemas.topLeftRadius': 'Top-left corner radius (px)',
  'schema.executeSchemas.topRightRadius': 'Top-right corner radius (px)',
  'schema.executeSchemas.bottomLeftRadius': 'Bottom-left corner radius (px)',
  'schema.executeSchemas.bottomRightRadius': 'Bottom-right corner radius (px)',
  'schema.executeSchemas.paddingTop': 'Top padding (px)',
  'schema.executeSchemas.paddingRight': 'Right padding (px)',
  'schema.executeSchemas.paddingBottom': 'Bottom padding (px)',
  'schema.executeSchemas.paddingLeft': 'Left padding (px)',
  'schema.executeSchemas.primaryAxisSizingMode':
    'Main axis sizing mode: FIXED | AUTO',
  'schema.executeSchemas.counterAxisSizingMode':
    'Cross axis sizing mode: FIXED | AUTO',
  'schema.executeSchemas.counterAxisAlignItems':
    'Cross axis alignment: MIN | MAX | CENTER',
  'schema.executeSchemas.layoutGrow': 'Grow factor inside auto-layout',
  'schema.executeSchemas.layoutAlign':
    'Cross-axis alignment: INHERIT | STRETCH',
  'schema.executeSchemas.type2': 'RECTANGLE = rectangle',
  'schema.executeSchemas.cornerRadius2': 'Corner radius (px)',
  'schema.executeSchemas.startingAngle': 'Starting angle (radians)',
  'schema.executeSchemas.endingAngle': 'Ending angle (radians)',
  'schema.executeSchemas.innerRadius': 'Inner radius (0-1 ratio)',
  'schema.executeSchemas.innerRadius2': 'Arc path parameters, draws a ring',
  'schema.executeSchemas.innerRadius3':
    'ELLIPSE = ellipse (use arcData to draw a ring)',
  'schema.executeSchemas.type3': 'LINE = line',
  'schema.executeSchemas.pointCount': 'Polygon corner count, e.g. 6 = hexagon',
  'schema.executeSchemas.cornerRadius3': 'Corner radius (px)',
  'schema.executeSchemas.topLeftRadius2': 'Top-left corner radius (px)',
  'schema.executeSchemas.topRightRadius2': 'Top-right corner radius (px)',
  'schema.executeSchemas.bottomLeftRadius2': 'Bottom-left corner radius (px)',
  'schema.executeSchemas.bottomRightRadius2': 'Bottom-right corner radius (px)',
  'schema.executeSchemas.bottomRightRadius3':
    'POLYGON = polygon (use pointCount)',
  'schema.executeSchemas.pointCount2':
    'Star point count, e.g. 5 = five-pointed star',
  'schema.executeSchemas.innerRadius4': 'Inner radius (0-1 ratio)',
  'schema.executeSchemas.cornerRadius4': 'Corner radius (px)',
  'schema.executeSchemas.topLeftRadius3': 'Top-left corner radius (px)',
  'schema.executeSchemas.topRightRadius3': 'Top-right corner radius (px)',
  'schema.executeSchemas.bottomLeftRadius3': 'Bottom-left corner radius (px)',
  'schema.executeSchemas.bottomRightRadius4': 'Bottom-right corner radius (px)',
  'schema.executeSchemas.bottomRightRadius5':
    'STAR = star (with pointCount / innerRadius)',
  'schema.executeSchemas.vectorPaths': 'Vector path data',
  'schema.executeSchemas.fontSize': 'Font size (px), default 16',
  'schema.executeSchemas.textAlignHorizontal':
    'Horizontal alignment: LEFT | RIGHT | CENTER | JUSTIFIED',
  'schema.executeSchemas.textAlignVertical':
    'Vertical alignment: TOP | CENTER | BOTTOM',
  'schema.executeSchemas.textCase':
    'Text case: ORIGINAL | UPPER | LOWER | TITLE',
  'schema.executeSchemas.textDecoration':
    'Text decoration: NONE | UNDERLINE | STRIKETHROUGH',
  'schema.executeSchemas.lineHeight': 'Line height: {value, unit}',
  'schema.executeSchemas.letterSpacing': 'Letter spacing: {value, unit}',
  'schema.executeSchemas.letterSpacing2':
    'Letter spacing: {value, unit}, unit is PIXELS | PERCENT',
  'schema.executeSchemas.children': 'Child node array (recursive)',
  'schema.executeSchemas.paddingTop2': 'Top padding (px)',
  'schema.executeSchemas.paddingRight2': 'Right padding (px)',
  'schema.executeSchemas.paddingBottom2': 'Bottom padding (px)',
  'schema.executeSchemas.paddingLeft2': 'Left padding (px)',
  'schema.executeSchemas.primaryAxisSizingMode2':
    'Main axis sizing mode: FIXED | AUTO',
  'schema.executeSchemas.counterAxisSizingMode2':
    'Cross axis sizing mode: FIXED | AUTO',
  'schema.executeSchemas.counterAxisAlignItems2':
    'Cross axis alignment: MIN | MAX | CENTER',
  'schema.executeSchemas.path':
    'GROUP = group (implemented as a frame internally)',
  'schema.executeSchemas.children2': 'Child nodes to merge (at least 2)',
  'schema.executeSchemas.children3':
    'BOOLEAN_OPERATION = boolean operation (merges child nodes)',
  'schema.execute.name': 'Name of the generated layer, default svg-design',
  'schema.execute.html': 'HTML fragment, inline styles supported',
  'schema.execute.name2': 'Name of the generated layer, default html-design',
  'schema.execute.size': 'Icon edge length in px, default 24',
  'schema.execute.color': 'Stroke color (hex), default #000000',
  'schema.execute.strokeWidth': 'Stroke width, default 2',
  'schema.execute.name3':
    'Name of the generated layer, default icon-<icon name>',
  'schema.inputs.ids': 'Find by node id, highest priority',
  'schema.inputs.name': 'Fuzzy match by name (contains)',
  'schema.inputs.recursive': 'Whether to search recursively (default true)',
  'schema.inputs.depth':
    'Serialization depth: 0 = self only, 1 = with direct children; default 1',
  'schema.inputs.name2': 'Group only: group name',
  'schema.inputs.paddingTop': 'Group only. Top padding (px)',
  'schema.inputs.paddingRight': 'Group only. Right padding (px)',
  'schema.inputs.paddingBottom': 'Group only. Bottom padding (px)',
  'schema.inputs.paddingLeft': 'Group only. Left padding (px)',
  'schema.inputs.primaryAxisSizingMode':
    'Group only. Main axis sizing mode: FIXED | AUTO',
  'schema.inputs.counterAxisSizingMode':
    'Group only. Cross axis sizing mode: FIXED | AUTO',
  'schema.inputs.counterAxisAlignItems':
    'Group only. Cross axis alignment: MIN | MAX | CENTER',
  'schema.inputs.key':
    'Team library component key (required only for import_component)',
  'schema.inputs.componentId': 'Target component (COMPONENT) node id',
  'schema.inputs.format': 'Export format, default PNG',
  'schema.inputs.scale': 'Scale factor (PNG/JPG), default 1',
  'schema.inputs.savePath': 'Absolute path to write, e.g. /tmp/icon.png',
  'schema.inputs.includeDataUrl':
    'Whether to also return the base64 dataURL, default false',
  'schema.inputs.ids2': 'Node ids to fill with the image',
  'schema.inputs.sourcePath':
    'Absolute path of the local image, e.g. /tmp/poster.png',
  'schema.inputs.params': 'Operation parameters; the shape depends on the op',
  'schema.inputs.family':
    'Filter by family name (case-insensitive substring), e.g. "Source"',
  'schema.inputs.offset': 'Paging start index (families to skip), default 0',
  'schema.inputs.limit':
    'Max families per page, default 50, max 500; a font library can hold ~1900 families and dumping all of them blows up the context',
  'schema.platform.name':
    'op name, pass it verbatim when calling jsd_platform_op',
  'schema.platform.description': 'Includes the params shape',
  'schema.results.capabilities': 'Platform-difference capabilities',
  'schema.results.families': 'Available font families',
  'schema.results.family': 'Font family',
  'schema.results.styles':
    'Styles available in this family, e.g. ["Regular","Medium","Bold"]',
  'schema.results.count': 'Number of font families in this page',
  'schema.results.total':
    'Total families after filtering (independent of paging)',
  'schema.results.offset': 'Start index of this page',
  'schema.results.truncated':
    'true means more pages exist; continue with offset',
  'schema.sharedProps.width': 'Width (px)',
  'schema.sharedProps.height': 'Height (px)',
  'schema.sharedProps.rotation':
    'Rotation angle (deg, around the node top-left origin; x/y unchanged)',
  'schema.sharedProps.opacity': 'Opacity 0-1',
  'schema.sharedProps.pointCount':
    'Polygon/star corner count (POLYGON / STAR only)',
  'schema.sharedProps.innerRadius': 'Inner radius (0-1 ratio)',
  'schema.sharedProps.strokes': 'Stroke list (Paint array)',
  'schema.sharedProps.strokeWeight': 'Stroke weight (px)',
  'schema.sharedProps.strokeTopWeight': 'Top stroke weight (px)',
  'schema.sharedProps.strokeBottomWeight': 'Bottom stroke weight (px)',
  'schema.sharedProps.strokeLeftWeight': 'Left stroke weight (px)',
  'schema.sharedProps.strokeRightWeight': 'Right stroke weight (px)',
  'schema.sharedProps.strokeAlign':
    'Stroke alignment: CENTER | INSIDE | OUTSIDE',
  'schema.sharedProps.strokeCap': 'Stroke cap: NONE | ROUND | SQUARE',
  'schema.sharedProps.strokeJoin': 'Stroke join: MITER | BEVEL | ROUND',
  'schema.sharedProps.dashPattern': 'Dash segment array, e.g. [4,4]',
  'schema.sharedProps.strokeStyleId': 'Local stroke style id',
  'schema.sharedProps.topLeftRadius':
    'Top-left corner radius (px), same applicable types as cornerRadius',
  'schema.sharedProps.topRightRadius':
    'Top-right corner radius (px), same applicable types as cornerRadius',
  'schema.sharedProps.bottomLeftRadius':
    'Bottom-left corner radius (px), same applicable types as cornerRadius',
  'schema.sharedProps.bottomRightRadius':
    'Bottom-right corner radius (px), same applicable types as cornerRadius',
  'schema.sharedProps.characters': 'Text content (TEXT nodes only)',
  'schema.sharedProps.fontSize': 'Font size (px)',
  'schema.sharedProps.textAlignHorizontal':
    'Horizontal alignment: LEFT | RIGHT | CENTER | JUSTIFIED',
  'schema.sharedProps.textAlignVertical':
    'Vertical alignment: TOP | CENTER | BOTTOM',
  'schema.sharedProps.textCase': 'Text case: ORIGINAL | UPPER | LOWER | TITLE',
  'schema.sharedProps.textDecoration':
    'Text decoration: NONE | UNDERLINE | STRIKETHROUGH',
  'schema.sharedProps.lineHeight': 'Line height: {value, unit}',
  'schema.sharedProps.letterSpacing': 'Letter spacing: {value, unit}',
  'schema.sharedProps.textStyleId': 'Local text style id',
  'schema.sharedProps.textTruncation':
    'Text truncation: DISABLED | ENDING (Figma only)',
  'schema.sharedProps.maxLines': 'Maximum number of lines, Figma only',
  'schema.sharedProps.paddingTop': 'Top padding (px)',
  'schema.sharedProps.paddingRight': 'Right padding (px)',
  'schema.sharedProps.paddingBottom': 'Bottom padding (px)',
  'schema.sharedProps.paddingLeft': 'Left padding (px)',
  'schema.sharedProps.primaryAxisSizingMode':
    'Main axis sizing mode: FIXED | AUTO',
  'schema.sharedProps.counterAxisSizingMode':
    'Cross axis sizing mode: FIXED | AUTO',
  'schema.sharedProps.counterAxisAlignItems':
    'Cross axis alignment: MIN | MAX | CENTER',
  'schema.sharedProps.layoutGrow': 'Grow factor inside auto-layout',
  'schema.sharedProps.layoutAlign': 'Cross-axis alignment: INHERIT | STRETCH',
  'schema.sharedProps.fillStyleId': 'Local fill style id',
  'schema.sharedProps.effectStyleId': 'Local effect style id',
  'schema.sharedProps.effects': 'Effect list (shadow/blur, stackable)',
  'schema.sharedProps.vertical': 'Constraint inside auto-layout',
  'schema.sharedProps.clipsContent': 'Whether overflowing content is clipped',
  'schema.sharedProps.cornerSmoothing': 'Corner smoothing 0-1',
  'schema.sharedProps.layoutGrids': 'Layout grids (guides)',
  'schema.sharedProps.startingAngle': 'Starting angle (radians)',
  'schema.sharedProps.endingAngle': 'Ending angle (radians)',
  'schema.sharedProps.innerRadius2': 'Inner radius (0-1 ratio)',
  'schema.sharedProps.innerRadius3': 'Arc path parameters, ELLIPSE nodes only',
  'schema.splitOps.ids':
    'Target node id list; defaults to the current selection',
  'schema.splitOps.matchName': 'Filter precisely by name',
  'schema.splitOps.ids2':
    'Node ids to delete; defaults to the current selection',
  'schema.splitOps.matchName2': 'Delete only nodes whose name matches exactly',
  'schema.splitOps.name': 'Group name',
  'schema.splitOps.paddingTop': 'Top padding (px)',
  'schema.splitOps.paddingRight': 'Right padding (px)',
  'schema.splitOps.paddingBottom': 'Bottom padding (px)',
  'schema.splitOps.paddingLeft': 'Left padding (px)',
  'schema.splitOps.primaryAxisSizingMode':
    'Main axis sizing mode: FIXED | AUTO',
  'schema.splitOps.counterAxisSizingMode':
    'Cross axis sizing mode: FIXED | AUTO',
  'schema.splitOps.counterAxisAlignItems':
    'Cross axis alignment: MIN | MAX | CENTER',
  'schema.splitOps.ids3':
    'Ids of broken nodes to clean up; defaults to all broken nodes on the current page',
  'schema.splitOps.name2': 'Component name',
  'schema.splitOps.key': 'Team library component key',
  'schema.splitOps.name3': 'Name of the imported node',
  'schema.splitOps.componentId': 'Target component (COMPONENT) node id',
  'schema.splitOps.name4': 'Variant set name',
  'schema.splitOps.sourceId':
    'Source instance id, i.e. the snapshotId returned by an earlier copy_overrides',
  'schema.splitOps.name5': 'New node name',
  // ── MCP 工具面(注册期投影;源码里存键) ──
  'batch.title': 'Batch orchestration',
  'batch.followUp': 'Review the canvas result after the orchestrated run',
  'createComponent.title': 'Create component',
  'createComponent.description':
    'Create a COMPONENT and return the new id. Pass children to build it with content in one call (same fields as jsd_create_frame children), optionally with width/height; without children you get an empty shell to fill via jsd_reparent_nodes. The source nodes are never converted or modified — a component is always created fresh. Name variants as "prop=value, prop=value"; set variant properties with jsd_set_instance_properties',
  'createComponent.description2':
    'Resize the component / add fill, corner radius, shadow',
  'createInstance.title': 'Create component instance',
  'createInstance.description': 'Set the variant properties of the instance',
  'detachInstance.title': 'Detach instance',
  'detachInstance.description': 'Edit the detached node freely',
  'importComponent.title': 'Import component from team library',
  'importComponent.description': 'Create an instance of the imported component',
  'swapComponent.title': 'Swap component',
  'swapComponent.description': 'Set variant properties after the swap',
  'setInstanceProperties.title': 'Set variant properties',
  'setInstanceProperties.description': 'Sync overrides across other instances',
  'combineAsVariants.title': 'Combine as variant set',
  'copyOverrides.title': 'Copy instance overrides snapshot',
  'copyOverrides.description': 'Apply the snapshot to target instances',
  'applyOverrides.title': 'Apply instance overrides snapshot',
  'applyOverrides.description': 'Keep syncing other instances',
  'syncOverrides.title': 'Sync instance overrides',
  'syncOverrides.description': 'Review the synced instances',
  'createFrame.title': 'Create frame container',
  'createFrame.description':
    'Create a single FRAME node; input holds only FRAME fields: width/height size, layoutMode auto-layout (itemSpacing/padding*/main and cross axis sizing and alignment) plus visual fields such as fills and strokes. Only one root FRAME is created; nest children recursively with `children` (child x/y is relative to the parent). Set layoutMode=HORIZONTAL or VERTICAL before auto-layout fields (otherwise they are ignored). Without explicit fills the engine defaults to a white background; pass fills:[{type:"SOLID",color:{r:0,g:0,b:0},opacity:0}] for a transparent container. Use jsd_batch to create multiple roots or complex trees',
  'createRectangle.title': 'Create rectangle',
  'createRectangle.description':
    'Create a single RECTANGLE node; input holds only rectangle fields: width/height, cornerRadius per corner and visual fields such as fills and strokes. Only one root rectangle; nest children recursively with `children`. Use jsd_batch for multiple roots or complex trees',
  'createText.title': 'Create text',
  'createText.description':
    'Create a single TEXT node; input holds only text fields: characters (required), fontSize/fontName, alignment/auto-resize/case/decoration/line-height/letter-spacing and fills/strokes. Only one root text node. Resolve fonts with jsd_list_fonts first: use fonts[].family verbatim and the full name from the same entry\'s styles (e.g. SourceHanSansCN-Bold, not the short "Bold") — a wrong value fails silently and falls back to the default face, and the result warnings will name it. For wrapping pass width + textAutoResize:"HEIGHT" (the default WIDTH_AND_HEIGHT grows with content; width alone gets forced to NONE and the height stops tracking content). Use jsd_batch for multiple roots',
  'createEllipse.title': 'Create ellipse',
  'createEllipse.description':
    'Create a single ELLIPSE node: width/height, arcData ring parameters (draws a ring) and visual fields such as fills and strokes. Only one root ellipse; use jsd_batch for multiple roots or complex trees',
  'createLine.title': 'Create line',
  'createLine.description':
    'Create a single LINE node: width/height and stroke fields. For short straight segments LINE + rotation is more stable. One axis may be 0: the engine resize check demands >= 0.01 so the plugin lifts the zero axis to 0.01 (visually a straight line, serialization still reads 0); jsd_resize_node accepts a zero axis too. Use jsd_batch for multiple roots',
  'createPolygon.title': 'Create polygon',
  'createPolygon.description':
    'Create a single POLYGON node: pointCount is required (e.g. 6 = hexagon), plus cornerRadius and visual fields. Only one root polygon; use jsd_batch for multiple roots',
  'createStar.title': 'Create star',
  'createStar.description':
    'Create a single STAR node: pointCount corner count, innerRadius ratio and visual fields such as fills and strokes. Only one root star; use jsd_batch for multiple roots',
  'createVector.title': 'Create vector',
  'createVector.description':
    'Create a single VECTOR node: vectorPaths/vectorNetwork geometry with fills and strokes. Prefer jsd_create_icon or SVG import for icon-like shapes; use jsd_batch for multiple roots',
  'createGroup.title': 'Create group',
  'createGroup.description':
    'Create a single GROUP node wrapping the given children: group first, then lay out. Only one root group; use jsd_batch for multiple roots',
  'createBooleanOperation.title': 'Create boolean operation node',
  'createSvg.title': 'Import SVG',
  'createIcon.title': 'Insert built-in icon',
  'htmlToDesign.title': 'HTML to design nodes',
  'htmlToDesign.description':
    'Convert an HTML fragment into canvas nodes. Default path is jsd_html_to_design (SVG fidelity, complex styles dropped); only use per-type create tools (jsd_create_frame etc.) when editable layers are required',
  'manageNodes.title': 'Node structure operations (aggregate)',
  'manageNodes.followUp':
    'Set the container auto-layout after the structure change',
  'manageComponents.title': 'Component and instance operations (aggregate)',
  'manageComponents.description':
    'Aggregate entrypoint dispatching by op: create_component / create_instance / detach_instance / import_component / combine_as_variants / swap_component / set_instance_properties / copy_overrides / apply_overrides / sync_overrides. Prefer the dedicated small tools for a single op',
  'manageComponents.description2':
    'Set variant properties after the component/instance change',
  'find.title': 'Find nodes',
  'find.description':
    'Set the matched nodes as the current selection for later edits/deletes',
  'selectNodes.title': 'Set canvas selection',
  'selectNodes.description': 'Move or resize the selected nodes',
  'deleteNode.title': 'Delete node',
  'deleteNode.description': 'Review the remaining nodes after deletion',
  'cloneNode.title': 'Clone node',
  'cloneNode.description': 'Move the copy to the target position',
  'groupNodes.title': 'Group nodes',
  'groupNodes.description': 'Set the auto-layout of the new group',
  'ungroupNodes.title': 'Ungroup nodes',
  'ungroupNodes.description': 'Adjust child positions after ungrouping',
  'flattenNodes.title': 'Flatten into vector',
  'flattenNodes.description': 'Set the fill of the flattened shape',
  'outlineStroke.title': 'Outline stroke',
  'outlineStroke.description': 'Adjust the stroke of the new outline',
  'reparentNodes.title': 'Move nodes under a parent',
  'reparentNodes.description':
    'Fine-tune x/y under the new parent if needed (absolute position is preserved automatically)',
  'repairNodes.title': 'Repair broken nodes',
  'repairNodes.description': 'Review the page node state after repairing',
  'platformOp.title': 'Platform-specific operation',
  'platformOp.description':
    'Run a platform-specific op by name (only Figma has them; jsDesign has no equivalent — read the jsd://styles resource for local styles (no same-named tool), jsd_set_instance_properties for component properties). Read platformOps from jsd_ping or jsd://platform/state first',
  'platformOp.description2':
    'Review the effect of the platform op on the canvas',
  'prompt.htmlToDesign.title': 'HTML to design',
  'prompt.htmlToDesign.description':
    'Convert an HTML fragment into canvas nodes, with fidelity trade-offs',
  'prompt.iconGrid.title': 'Icon grid',
  'prompt.iconGrid.description':
    'Insert Lucide icons in bulk and lay them out in an auto-layout grid',
  'prompt.scriptOps.title': 'Scripted batch calls',
  'prompt.designStrategy.title': 'Design strategy overview',
  'prompt.textReplace.title': 'Bulk text replacement strategy',
  'prompt.variantSync.title': 'Bulk sync styles across sibling instances',
  'setFillColor.title': 'Set fill',
  'setFillColor.followUp': 'Next set the stroke',
  'setStroke.title': 'Set stroke',
  'setStroke.description': 'Next set the fill',
  'setCornerRadius.title': 'Set corner radius',
  'setCornerRadius.description': 'Next set shadow/blur effects',
  'setText.title': 'Modify text',
  'setText.followUp': 'Give the text a semantic name',
  'moveNode.title': 'Move node',
  'moveNode.description': 'Next adjust the size',
  'resizeNode.title': 'Resize node',
  'resizeNode.description': 'Next set visibility/lock',
  'setLayout.title': 'Set auto-layout',
  'setLayout.description':
    'Move child nodes into the container to finish the layout',
  'setEffects.title': 'Set effects and advanced properties',
  'setEffects.description': 'Next set visibility/lock',
  'setVisibility.title': 'Set visibility and lock',
  'setVisibility.description': 'Review the canvas selection after the change',
  'renameNode.title': 'Rename node',
  'renameNode.description': 'Next edit the text content/typography',
  'setShape.title': 'Set polygon/star shape',
  'setShape.description': 'Next set the fill',
  'export.title': 'Export nodes as images',
  'export.description':
    'Export the given nodes to PNG files. Large base64 payloads are dropped from the result and written to disk instead; use jsd_export again with a smaller scale if you need inline data',
  'export.description2': 'Fill the exported image into a node',
  'fillImage.title': 'Fill node with a local image',
  'fillImage.description':
    'Read a local image file and fill the given nodes with it (IMAGE fill)',
  'fillImage.description2': 'Review the image fill result',
  'listFonts.title': 'List available fonts',
  'listFonts.description': 'Set text with the listed fonts',
  'resources.title': 'Current canvas selection',
  'resources.title2': 'Available font list',
  'resources.title3': 'Local style list',
  'resources.title4': 'Current page structure overview',
  'resources.title5': 'Node detail',
  'resources.title6': 'Platform state and capabilities',
  'ping.followUp':
    'Read the current selection once the connection is confirmed',
  'getSelection.title': 'Read canvas selection',
  'getSelection.description':
    'Read the current selection of the canvas, serialized with direct children; equivalent to jsd_get_selection depth=2',
  'getSelection.description2': 'Find nodes precisely inside the selection',
  'mcp.instructions':
    'Tools for operating the design canvas. One operation per jsd_* tool, no op dispatch; the aggregate entrypoints jsd_manage_nodes / jsd_manage_components are only for batch or mixed structure operations. Discipline:\n- Create nodes with per-type tools: jsd_create_frame / jsd_create_rectangle / jsd_create_text etc., one node type each; use jsd_batch for multi-root or deeply nested trees. The root x/y comes from placement (default center overwrites the root x/y with the viewport centre; pass placement:{mode:"manual"} to lay out by coordinates, or mode:"absolute" with x/y). Nest hierarchy with children (child x/y is relative to the parent), then jsd_reparent_nodes to group (pass parentId explicitly; cross-parent moves preserve absolute position and recompute x/y under the new parent, and auto-layout containers take over the position). Set auto-layout (layoutMode/itemSpacing/padding* …) last with jsd_set_layout.\n- Modify properties with the dedicated tools: fills jsd_set_fill_color, stroke jsd_set_stroke, radius jsd_set_cornerRadius, text jsd_set_text, position jsd_move_node, size jsd_resize_node (x/y too), layout jsd_set_layout, effects jsd_set_effects, visibility jsd_set_visibility, rename jsd_rename_node, shape jsd_set_shape.\n- Orchestrate multi-step flows with jsd_batch: reference earlier results with double-brace placeholders (step id + field path); intermediate ids never reach the model. Placeholders are valid only inside the same call. Step echoes are trimmed (nodes keep id/name/type/x/y), and batches with icons/vectors need a separate jsd_export for visual acceptance — an echo is not proof it worked.\n- Batch styling with ids: recursive=true applies to descendants only, not the target itself (styling a group of icon containers does not frame the container); add includeSelf=true to include it.\n- Style overrides on children inside an INSTANCE are not guaranteed to render; when hit, the result warnings name the matching child in the main component — fix the main component and every instance inherits it.\n- Result key contract (needed to write jsd_batch placeholders; not from outputSchema, which is projected to key names + types only, see daemon/compact-schema.ts): node results created is a single object or an array (per-type create / jsd_clone_node / jsd_outline_stroke / jsd_create_instance / jsd_detach_instance are arrays; jsd_create_svg / jsd_create_icon / jsd_group_nodes / jsd_flatten_nodes / jsd_create_component / jsd_import_component are single objects), updated / moved / swapped are arrays of objects (keys id/name/type/x/y/width/height/z/parentId), id lists selected / removed / ungrouped / cleaned are string arrays, jsd_find returns nodes + total, jsd_get_selection returns selection + pageName, jsd_export returns exports (with path / dataUrl). Placeholders look like {{id.updated[0].id}}; for a single object write {{id.created.id}} (adding [0] breaks it).\n- Always read the result warnings: they name facts that "echoed success but did not take effect" (fields ignored by platform capability gating, read-back mismatches such as root x/y overwritten by placement, TEXT textAutoResize silently set to NONE, unknown fontName combinations, sibling drift after structure changes). Font resolution: family from jsd_list_fonts fonts[].family verbatim, style the full name from the same entry (e.g. SourceHanSansCN-Bold, not "Bold").\n- ok=false or "node X not found": first jsd_find to check whether the id is gone (it may have been deleted as collateral), then jsd_repair_nodes if needed and retry.',
  'ping.title': 'Check {client} plugin connection',
  'batch.description':
    'Batch orchestrator: runs several jsd_* steps in order inside one request. Earlier results are injected into later args through double-brace placeholders (content = step id + field path); intermediate ids never reach the model, which cuts round-trips and context a lot.\nA placeholder that occupies a whole argument keeps its type (an array can be used directly as ids); embedded in a string it is expanded as JSON text. Placeholders are valid only inside the same call (the step table is destroyed when the call ends; referencing a previous batch aborts the whole batch). Duplicate ids, unknown tools or unresolvable references abort immediately; a failing step aborts by default (stopOnError=false, or per-step continueOnError=true, lets it finish).\nEchoes are trimmed: node objects keep id/name/type/x/y/width/height/z/parentId; vectorPaths and constraints are dropped entirely. Steps still over 20K chars after trimming degrade to an id list (echoTrimmed=true). Resolution is unaffected (the full data is used internally). Batches containing icons must be verified visually with one jsd_export — an echo is not proof.\nResult keys and placeholder syntax per tool (a wrong key aborts the batch): created is an array for per-type create / jsd_clone_node / jsd_outline_stroke / jsd_create_instance / jsd_detach_instance and a single object for jsd_create_svg / jsd_create_icon / jsd_flatten_nodes / jsd_group_nodes / jsd_create_component / jsd_import_component / jsd_combine_as_variants; jsd_find -> nodes; jsd_get_selection -> selection; jsd_set_* -> updated; jsd_swap_component -> swapped; jsd_manage_nodes ops: select/remove/ungroup/repair -> id string arrays, clone/outline_stroke -> created[group/flatten -> created (single object), reparent -> moved[].\nStructure drift review is on by default (checkDrift=false disables it): steps containing remove/reparent/group/ungroup/flatten/repair record sibling coordinates before the change and report any node that moved on its own.',
  'manageNodes.description':
    'Aggregate entrypoint for node structure operations dispatched by op: select | remove | clone | group | ungroup | flatten | outline_stroke | reparent | repair. For a single operation prefer the matching small tool: jsd_select_nodes / jsd_delete_node / jsd_clone_node / jsd_group_nodes / jsd_ungroup_nodes / jsd_flatten_nodes / jsd_outline_stroke / jsd_reparent_nodes / jsd_repair_nodes (their descriptions carry platform caveats and the correct flow). Property edits belong to jsd_set_* (incl. jsd_set_shape); component/instance work belongs to jsd_manage_components or jsd_create_component / jsd_sync_overrides — ops are not interchangeable.\nResult keys per op (needed to write correct jsd_batch placeholders; a wrong key aborts the batch): select -> selected[and remove -> removed[are id strings; clone/outline_stroke -> created[is an array of nodes; group/flatten -> created is a single node object; ungroup -> ungrouped[is id strings; reparent -> moved[(updated[mirrors it); repair -> cleaned[is id strings.',
  'createBooleanOperation.description':
    'Create a single BOOLEAN_OPERATION node: the booleanOperation mode ({ops}) and children (at least 2 merged child nodes) are required. Only one root boolean node; use jsd_batch for multiple roots or complex trees',
  'setFillColor.description':
    'Set fill color/gradient (fills is a Paint array, replaced wholesale rather than merged — pass existing fills you want to keep), blend mode and team-library fill styles. {warn}',
  'setText.description':
    'Modify text content and typography (TEXT nodes only): characters/fontSize/fontName, alignment/auto-resize/case/decoration/line-height/letter-spacing, plus Figma truncation and max lines. Resolve fonts with jsd_list_fonts first: family verbatim from fonts[].family, style the full name from the same entry (e.g. SourceHanSansCN-Bold, not the short "Bold") — a wrong value fails silently and falls back to the default face, and the result warnings name it. For wrapping pass width + textAutoResize:"HEIGHT" (the default WIDTH_AND_HEIGHT grows with content; width alone gets forced to NONE and the height stops tracking content). {warn}; characters overrides work normally inside instances too',
  'ping.description':
    'Check whether the plugin is online (you must first run it inside {client} — Instant Design or Figma — and keep it running). Returns three capability tables: coreCapabilities (create/modify/structure/component/export/image, identical on both platforms); capabilities lists only the platform-difference superset (e.g. variables/componentProperties/textTruncation) — Instant Design usually has only styles while Figma also has variables/componentProperties; platformOps lists platform-specific ops available now (name/title/parameter description) — read it before calling jsd_platform_op. The reply is cached by the daemon, so you can read jsd://platform/state afterwards instead of pinging again',
} as const satisfies Record<keyof typeof MESSAGES_ZH_CN, string | null>;
