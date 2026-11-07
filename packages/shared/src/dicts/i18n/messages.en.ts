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
  'capability.host.styleEnumeration':
    'Local style listing (can enumerate which styles exist)',
  'capability.host.styleEnumerationSync':
    'Style enumeration uses the sync entry (runtime *Async members are unusable)',
  'capability.host.mainComponentSync':
    'Main component read via the sync field (runtime getMainComponentAsync never settles)',
  'capability.host.textTruncation': 'Text truncation',
  'capability.host.componentProperties': 'Component properties',
  'capability.host.documentScopeRead':
    'Document-scope read (can read pages other than the current one)',
  'capability.host.variables': 'Variables',
  'capability.host.inPlaceVariants': 'In-place variants',

  'locale.zh-CN': '中文',
  'locale.en': 'English',
  'locale.abbr.zh-CN': '中',
  'locale.abbr.en': 'EN',
  'locale.menu': 'Language',

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
  'header.theme.toDark': 'Switch to dark theme',
  'header.theme.toLight': 'Switch to light theme',
  'header.cameraLock.locked': 'Camera locked',
  'header.cameraLock.unlocked': 'Camera follows',
  'header.cameraLock.title.locked':
    'Camera locked: canvas operations do not move your viewport (click to follow)',
  'header.cameraLock.title.unlocked':
    'Camera follows: canvas operations scroll and zoom to the result (click to lock)',
  'header.minimize': 'Minimize',
  'header.minimize.title':
    'Minimize the panel to just the logo; double-click the logo to restore',
  'header.restore.title': 'Double-click the logo to restore the panel',

  'upgrade.title': 'A newer version is available (click for upgrade steps)',
  'upgrade.modal.title': 'Upgrade to the latest version',
  'upgrade.current': 'Current {version}',
  'upgrade.latest': 'Latest {version}',
  'upgrade.plugin.label': 'Plugin',
  // 单列宽度放不下 `Background service`(版本对照是两列一行),收到 `Service`
  'upgrade.service.label': 'Service',
  'upgrade.step.service':
    '① Service, just restart the AI session. It runs npx -y text-to-design-mcp@latest, so it is always the newest',
  'upgrade.step.plugin.head': '② Plugin is a manual swap. Download the latest',
  'upgrade.step.plugin.tail':
    ', unzip it, then import the manifest for your platform',
  'upgrade.step.verify':
    '③ Run the plugin again. No upgrade icon up top means both sides match',
  'upgrade.copy': 'Copy for AI assistant',
  'upgrade.prompt':
    'I use text-to-design. Plugin text-to-design-ui is {ui}, latest {uiLatest}; service text-to-design-mcp is {mcp}, latest {mcpLatest}. Help me get both to the latest: ① check the MCP config command pins latest, then restart the AI session; ② download and unzip the latest text-to-design-ui (npm pack, or the zip from GitHub Releases), and tell me which manifest.json under dist/ to import for jsDesign / Figma / MasterGo; ③ report both version numbers when done.',

  'toast.copy.done': 'Copied',
  'toast.copy.failed': 'Copy failed',

  'conn.connected':
    'Connected. Select nodes on the canvas, click "Copy", then paste into your AI assistant — e.g. "make me another card in this node style"',
  'conn.superseded':
    'Another plugin panel has taken over this channel (only one panel is served at a time), so auto-reconnect has stopped. Click "Reclaim" next to the status badge to switch back to this panel.',
  'conn.disconnected.title': 'Not connected to the background service',
  'conn.disconnected.tutorial': 'Install guide',
  'conn.copyAi': '① Copy prompt for AI',
  'conn.copyDaemon': '② Copy start command',
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

  'panel.expand': 'Expand',
  'panel.collapse': 'Collapse',
  'panel.close': 'Close',

  'selection.title': 'Selected nodes',
  'selection.badge': '{count} nodes · {size} serialized',
  'selection.copy': 'Copy',
  'selection.empty.title': 'No nodes selected',
  'selection.empty.hint':
    'Select nodes on the canvas and they show up here, ready to copy',

  'capability.card.title': 'Capabilities',
  'capability.card.missing': 'Capabilities unavailable (plugin not connected)',
  'capability.card.badgeTitle':
    'Core capability count · platform-specific capabilities available · platform op count',
  'capability.card.badge': 'core {core} · platform {host}/{total} · op {ops}',
  'capability.card.coreSection': 'Core capabilities',
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
  'bridge.log.versionPush':
    'Latest npm versions received: plugin {ui}, service {mcp}',
  'bridge.log.versionUnknown': 'unknown',
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
  // ── Value-shape notes (what a field's value looks like) ──
  'schemaValue.color':
    'Color: hex (e.g. "#ff0000"; 8-digit hex becomes paint opacity) or {r,g,b} (0-1 channels, >1 = 0-255)',
  'schemaValue.rgba':
    'Color: hex (e.g. "#ff000080") or {r,g,b,a} (0-1 channels, >1 = 0-255; default 1)',
  'schemaValue.gradientStops': 'Gradient stops, at least 2',
  'schemaValue.constraint':
    'MIN = pin start | MAX = pin end | STRETCH = stretch | CENTER = center | SCALE = scale',
  'schemaValue.strokeJoin': 'Join style: MITER / BEVEL / ROUND',
  'schemaValue.strokeCap': 'Cap style; ARROW_* is Figma only',
  'schemaValue.textDecoration': 'Decoration line (default NONE)',
  'schemaValue.textCase': 'Case transform (default ORIGINAL)',
  'schemaValue.scaleMode': 'Scale mode: FILL / FIT / CROP / TILE',
  'schemaValue.arcData': 'Arc parameters, draws a ring',
  'schema.base.r':
    'Red channel, 0-1 (0=none, 1=full), e.g. 1 for pure red; values >1 are treated as 0-255 and auto-normalized',
  'schema.base.g': 'Green channel, 0-1 (or 0-255, auto-normalized)',
  'schema.base.b': 'Blue channel, 0-1 (or 0-255, auto-normalized)',
  'schema.base.a':
    'Opacity 0-1 (0=transparent, 1=opaque), defaults to 1; >1 treated as 0-255 and auto-normalized',
  'schema.base.color': 'Color of this stop (with alpha)',
  'schema.base.position': 'Stop position, 0-1 (0=start, 1=end)',
  'schema.base.transformSchema': '2×3 affine; [[1,0,0],[0,1,0]] = identity',
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
  'schema.batch.calls':
    'Step list, executed in array order (mutually exclusive with callsFile)',
  'schema.batch.callsFile':
    'Absolute path to a JSON file holding the step list (mutually exclusive with calls). Use it when the arguments are too large to fit in the context — the file holds {"calls":[…]}, or a bare array (equivalent), with the same shape as calls, and may also carry stopOnError / checkDrift. The file content is read and used as call arguments',
  'schema.batch.ok':
    'True when every step ran and succeeded (executed < total means it stopped halfway)',
  'schema.batch.executed': 'Number of steps that actually produced a result',
  'schema.batch.total': 'Total number of planned steps',
  'schema.batch.error': 'Failure reason (human-readable text)',
  'schema.batch.error2': 'Id of the step that failed',
  'schema.executeOp.depth': 'Serialization depth',
  'schema.executeSchemas.isMask': 'Use as a mask (geometry unchanged)',
  'schema.executeSchemas.childrenOf':
    'Child nodes, max 100 direct children; x/y are relative to the parent and default to (0,0). For bigger structures build in batches then regroup with jsd_reparent_nodes',
  'schema.executeSchemas.fills':
    'Fills. FRAME defaults to white; other shapes with strokes drop the fill — pass fills for a background',
  'schema.executeSchemas.layoutMode':
    'Auto-layout direction; set HORIZONTAL or VERTICAL before itemSpacing/padding*/primaryAxis*',
  'schema.executeSchemas.itemSpacing':
    'Item spacing (px); needs layoutMode; ignored when primaryAxisAlignItems is SPACE_BETWEEN',
  'schema.executeSchemas.primaryAxisAlignItems':
    'Main axis alignment; SPACE_BETWEEN ignores itemSpacing',
  'schema.executeSchemas.frameNote':
    'FRAME = container (auto-layout capable). Without fills the engine paints white — pass fills:[{type:"SOLID",color:{r:0,g:0,b:0},opacity:0}] for transparent',
  'schema.executeSchemas.vectorNote':
    'VECTOR = vector (with vectorPaths as SVG path data). ⚠ vectorPaths is sometimes lost/distorted after creation; use LINE+rotation for short segments',
  'schema.executeSchemas.characters':
    'Text content. Some emoji miss glyphs in the client font (render as ☒) — eyeball each one before shipping',
  'schema.executeSchemas.fontName':
    'Font {family,style}, exact match; check jsd_list_fonts first (falls back silently)',
  'schema.executeSchemas.textAutoResize':
    'Text auto resize: default WIDTH_AND_HEIGHT grows with content (width/height ignored) | HEIGHT = fixed width, auto height | NONE = fixed box | TRUNCATE',
  'schema.executeSchemas.type': 'Child node type',
  'schema.executeSchemas.x': 'X relative to the parent (px)',
  'schema.executeSchemas.y': 'Y relative to the parent (px)',
  'schema.executeSchemas.x2':
    'X (px, relative to parent; roots follow placement)',
  'schema.executeSchemas.y2':
    'Y (px, relative to parent; roots follow placement)',
  'schema.executeSchemas.width': 'Width (px)',
  'schema.executeSchemas.height': 'Height (px)',
  'schema.executeSchemas.rotation': 'Rotation angle (deg)',
  'schema.executeSchemas.opacity': 'Opacity 0-1',
  'schema.executeSchemas.strokes': 'Stroke list, replaced as a whole',
  'schema.executeSchemas.strokeWeight':
    'Stroke weight (px); per-side fields win',
  'schema.executeSchemas.strokeTopWeight':
    'Top border width (px); overrides strokeWeight',
  'schema.executeSchemas.strokeBottomWeight':
    'Bottom border width (px); same as above',
  'schema.executeSchemas.strokeLeftWeight':
    'Left border width (px); same as above',
  'schema.executeSchemas.strokeRightWeight':
    'Right border width (px); same as above',
  'schema.executeSchemas.strokeAlign':
    'Stroke alignment: CENTER | INSIDE | OUTSIDE',
  'schema.executeSchemas.strokeCap': 'Stroke cap: NONE | ROUND | SQUARE',
  'schema.executeSchemas.strokeJoin': 'Stroke join: MITER | BEVEL | ROUND',
  'schema.executeSchemas.dashPattern': 'Dash: segment lengths, e.g. [4,4]',
  'schema.executeSchemas.effects': 'Effect list (shadow / blur)',
  'schema.executeSchemas.vertical': 'Constraints when the parent resizes',
  'schema.executeSchemas.clipsContent':
    'Whether overflowing content is clipped',
  'schema.executeSchemas.cornerSmoothing': 'Corner smoothing 0-1',
  'schema.executeSchemas.layoutGrids': 'Layout grids (guides)',
  'schema.executeSchemas.cornerRadius': 'Corner radius (px)',
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
  'schema.executeSchemas.counterAxisAlignItems': 'Cross axis alignment',
  'schema.executeSchemas.layoutGrow':
    'Grow factor on the parent main axis (0 = no growth)',
  'schema.executeSchemas.layoutAlign':
    'Self alignment on the parent cross axis',
  'schema.executeSchemas.type2': 'RECTANGLE = rectangle',
  'schema.executeSchemas.startingAngle': 'Starting angle (rad)',
  'schema.executeSchemas.endingAngle': 'Ending angle (radians)',
  'schema.executeSchemas.innerRadius': 'Inner radius (0-1 ratio)',
  'schema.executeSchemas.innerRadius2': 'Arc path parameters, draws a ring',
  'schema.executeSchemas.ellipseNote':
    'ELLIPSE = ellipse (use arcData to draw a ring)',
  'schema.executeSchemas.type3': 'LINE = line',
  'schema.executeSchemas.pointCount': 'Polygon corner count, e.g. 6 = hexagon',
  'schema.executeSchemas.bottomRightRadius3':
    'POLYGON = polygon (use pointCount)',
  'schema.executeSchemas.pointCount2':
    'Star point count, e.g. 5 = five-pointed star',
  'schema.executeSchemas.innerRadius4': 'Inner radius (0-1 ratio)',
  'schema.executeSchemas.cornerRadius4': 'Corner radius (px)',
  'schema.executeSchemas.bottomRightRadius5':
    'STAR = star (with pointCount / innerRadius)',
  'schema.executeSchemas.vectorPaths': 'Vector path data',
  'schema.executeSchemas.fontSize': 'Font size (px), default 16',
  'schema.executeSchemas.textAlignHorizontal':
    'Horizontal alignment (default LEFT)',
  'schema.executeSchemas.textAlignVertical': 'Vertical alignment (default TOP)',
  'schema.executeSchemas.textCase':
    'Text case: ORIGINAL | UPPER | LOWER | TITLE',
  'schema.executeSchemas.textDecoration':
    'Text decoration: NONE | UNDERLINE | STRIKETHROUGH',
  'schema.executeSchemas.lineHeight': 'Line height: {value, unit}',
  'schema.executeSchemas.letterSpacing': 'Letter spacing: {value, unit}',
  'schema.executeSchemas.letterSpacing2':
    'TEXT = text (with characters / fontSize / fontName)',
  'schema.executeSchemas.children': 'Child node array (recursive)',
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
  'schema.sharedProps.strokeWeight': 'Stroke weight (px); per-side fields win',
  'schema.sharedProps.strokeTopWeight':
    'Top border width (px); overrides strokeWeight',
  'schema.sharedProps.strokeBottomWeight':
    'Bottom border width (px); same as above',
  'schema.sharedProps.strokeLeftWeight':
    'Left border width (px); same as above',
  'schema.sharedProps.strokeRightWeight':
    'Right border width (px); same as above',
  'schema.sharedProps.strokeAlign': 'Stroke alignment (default INSIDE)',
  'schema.sharedProps.strokeCap': 'Stroke cap; ARROW_* is Figma only',
  'schema.sharedProps.strokeJoin': 'Stroke join style',
  'schema.sharedProps.dashPattern': 'Dash segment array, e.g. [4,4]',
  'schema.sharedProps.strokeStyleId': 'Local stroke style id',
  'schema.sharedProps.cornerRadius':
    'Corner radius (px). LINE/TEXT have no corners; per-corner fields override it',
  'schema.sharedProps.topLeftRadius': 'schema.sharedProps.cornerRadius',
  'schema.sharedProps.topRightRadius': 'Top-right corner radius (px)',
  'schema.sharedProps.bottomLeftRadius': 'Bottom-left corner radius (px)',
  'schema.sharedProps.bottomRightRadius': 'Bottom-right corner radius (px)',
  'schema.sharedProps.characters': 'Text content (TEXT nodes only)',
  'schema.sharedProps.fontSize': 'Font size (px)',
  'schema.sharedProps.textAlignHorizontal':
    'Horizontal alignment (default LEFT)',
  'schema.sharedProps.textAlignVertical': 'Vertical alignment (default TOP)',
  'schema.sharedProps.textCase': 'Case transform (default ORIGINAL)',
  'schema.sharedProps.textDecoration': 'Decoration line (default NONE)',
  'schema.sharedProps.lineHeight':
    'Line height: {unit:"AUTO"} or {value,unit:PIXELS|PERCENT}',
  'schema.sharedProps.letterSpacing': 'Letter spacing; unit is PIXELS|PERCENT',
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
  'schema.sharedProps.counterAxisAlignItems': 'Cross axis alignment',
  'schema.sharedProps.layoutGrow':
    'Grow factor on the parent main axis (0 = no growth)',
  'schema.sharedProps.layoutAlign': 'Self alignment on the parent cross axis',
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
    'Create a single FRAME node; input holds only FRAME fields: width/height size, layoutMode auto-layout (itemSpacing/padding*/main and cross axis sizing and alignment) plus visual fields such as fills and strokes. Only one root FRAME is created; use children only for small structures (a container plus its direct children, child x/y relative to the parent) — never pass a whole screen tree in one children call. Build layer by layer with jsd_batch, then reparent each layer into its parent with jsd_reparent_nodes. Set layoutMode=HORIZONTAL or VERTICAL before auto-layout fields (otherwise they are ignored). **Siblings that sit evenly spaced on one axis must be built with auto-layout, never hand-computed coordinates** (tab bars, pill groups, KPI rows, card headers, list rows, whole-screen vertical sections; criterion and both landing paths in skill://canvas/references/auto-layout.md). **Get the sizing mode right**: on a layout container give only the width and let the other axis hug via AUTO — especially for content-sized containers such as dialogs and cards; only a screen root takes FIXED on both axes (a hardcoded height leaves dead space, or clips content when too small). Without explicit fills the engine defaults to a white background; pass fills:[{type:"SOLID",color:{r:0,g:0,b:0},opacity:0}] for a transparent container. Always pass a semantic name (e.g. "Sidebar", "KPI-OEE"); unnamed nodes fall back to the engine default name node. Use jsd_batch to create multiple roots or complex trees',
  'layoutHint.uniform':
    'Detected {count} children evenly spaced along {mode} (gap {gap}px) but the container declares no layoutMode. That is exactly the auto-layout criterion: set layoutMode:{mode} + itemSpacing:{gap} and the layout owns their positions — no coordinate recompute when copy or item count changes (advisory only, the create already succeeded; criterion and both landing paths in skill://canvas/references/auto-layout.md)',
  'structureHint.flatBatch':
    'This batch moves {batchCount} nodes into the same parent ({parentId}) — the shape of "every section flattened onto one layer". Structural layering is universal: screen -> semantic sections (status bar / header / hero / list / promo / bottom nav) -> card-level primitives; every element belongs to a semantic container, never straight onto the screen root. Recipe: skill://canvas/references/design-strategy.md (advisory only, the moves already succeeded)',
  'structureHint.svgNoGroups':
    'The SVG source carries no semantic <g id="..."> layers (counted {groupCount}) — after import the whole graphic lands as one un-splittable vector, so restyling a single layer means recomputing and re-importing. Cut one <g> per semantic layer with an ASCII semantic id (plot / grid / axis-x / series-<name> / legend); put a single transform on the outer plot group. Recipe: skill://canvas/references/chart-by-code.md section 5 (advisory only, the import already succeeded)',
  'createRectangle.title': 'Create rectangle',
  'createRectangle.description':
    'Create a single RECTANGLE node; input holds only rectangle fields: width/height, cornerRadius per corner and visual fields such as fills and strokes. Only one root rectangle; use children only for small structures (child x/y relative to the parent). Always pass a semantic name (e.g. "Card base", "Chart gridlines"); unnamed nodes fall back to the engine default name node. Use jsd_batch for multiple roots or complex trees',
  'createText.title': 'Create text',
  'createText.description':
    'Create a single TEXT node; input holds only text fields: characters (required), fontSize/fontName, alignment/auto-resize/case/decoration/line-height/letter-spacing and fills/strokes. Only one root text node. Resolve fonts with jsd_list_fonts first: use fonts[].family verbatim and the full name from the same entry\'s styles (e.g. SourceHanSansCN-Bold, not the short "Bold") — a wrong value fails silently and falls back to the default face, and the result warnings will name it. For wrapping pass width + textAutoResize:"HEIGHT" (the default WIDTH_AND_HEIGHT grows with content; width alone gets forced to NONE and the height stops tracking content). Always pass a semantic name (e.g. "Chart title", "KPI value"); unnamed nodes fall back to the engine default name node. Use jsd_batch for multiple roots',
  'createEllipse.title': 'Create ellipse',
  'createEllipse.description':
    'Create a single ELLIPSE node: width/height, arcData ring parameters (draws a ring) and visual fields such as fills and strokes. Only one root ellipse. Always pass a semantic name; unnamed nodes fall back to the engine default name node. Use jsd_batch for multiple roots or complex trees',
  'createLine.title': 'Create line',
  'createLine.description':
    'Create a single LINE node: width/height and stroke fields. For short straight segments LINE + rotation is more stable. One axis may be 0: the engine resize check demands >= 0.01 so the plugin lifts the zero axis to 0.01 (visually a straight line, serialization still reads 0); jsd_resize_node accepts a zero axis too. Always pass a semantic name; unnamed nodes fall back to the engine default name node. Use jsd_batch for multiple roots',
  'createPolygon.title': 'Create polygon',
  'createPolygon.description':
    'Create a single POLYGON node: pointCount is required (e.g. 6 = hexagon), plus cornerRadius and visual fields. Only one root polygon. Always pass a semantic name; unnamed nodes fall back to the engine default name node. Use jsd_batch for multiple roots',
  'createStar.title': 'Create star',
  'createStar.description':
    'Create a single STAR node: pointCount corner count, innerRadius ratio and visual fields such as fills and strokes. Only one root star. Always pass a semantic name; unnamed nodes fall back to the engine default name node. Use jsd_batch for multiple roots',
  'createVector.title': 'Create vector',
  'createVector.description':
    'Create a single VECTOR node: vectorPaths/vectorNetwork geometry with fills and strokes. Prefer jsd_create_icon or SVG import for icon-like shapes. Always pass a semantic name; unnamed nodes fall back to the engine default name node. Use jsd_batch for multiple roots',
  'createGroup.title': 'Create group',
  'createGroup.description':
    'Create a single GROUP node wrapping the given children: group first, then lay out. Only one root group. Always pass a semantic name; unnamed nodes fall back to the engine default name node. Use jsd_batch for multiple roots',
  'createBooleanOperation.title': 'Create boolean operation node',
  'createSvg.title': 'Import SVG',
  'createSvg.description':
    'Import an SVG into the canvas as editable layers (native createNodeFromSvg parsing; paths/gradients/strokes preserved). Pick one source: svg (inline string) or svgPath (path to a local .svg file, read by the background service). **Charts and data visualisations must use svgPath** (line, bar, pie/donut, scatter, radar, area, gauge, dashboard, Sankey, …): there is no built-in chart tool — write a script that computes the SVG, write it to a local file, then pass the path. Engine hard constraints (violations fail silently): the root element needs xmlns plus explicit width/height/viewBox; colours as hex only; no external images/fonts/scripts; approximate curves with C/Q, never the A command; canvas ≤2000×2000; split semantic layers into `<g id>` (one wrapper group is no grouping), with a single transform on the outer group only. Before you start, ReadMcpResource the recipe skill://canvas/references/chart-by-code.md — it carries the zero-dependency example, the colour and type-scale conventions, and the post-import layer check plus visual acceptance checklist. Use jsd_batch to orchestrate multiple root nodes or complex trees',
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
    'Run a platform-specific op (Figma: variables / local styles / component properties; MasterGo: variable read-write / component properties / set-level variant management). CRITICAL: never guess op names or parameters — read the platformOps list (each entry carries its parameter shape) and capabilities from jsd_ping first, then call by the listed names; an unsupported platform or a wrong op name returns an error listing the ops the current platform supports',
  'platformOp.description2':
    'Review the effect of the platform op on the canvas',
  'prompt.htmlToDesign.title': 'HTML to design',
  'prompt.htmlToDesign.description':
    'Convert an HTML fragment into canvas nodes, with fidelity trade-offs',
  'prompt.iconGrid.title': 'Icon grid',
  'prompt.iconGrid.description':
    'Insert Lucide icons in bulk and lay them out in an auto-layout grid',
  'prompt.scriptOps.title': 'Scripted batch calls',
  'prompt.chartByCode.title': 'Charts / data visualization by code',
  'prompt.chartByCode.description':
    'The primary path for charts and data visualization — line, bar, pie / donut, scatter, radar, area, gauge, dashboard or any other chart: write your own code to compute the geometry, save the SVG to a file, then import it via jsd_create_svg (dependency-free example plus engine-side hard constraints)',
  'prompt.designStrategy.title': 'Design strategy overview',
  'prompt.autoLayout.title': 'Auto layout',
  'prompt.autoLayout.description':
    'Whether a container should use auto layout (criteria plus easily-missed sections), self-judged direction (child flow axis, do not hardcode HORIZONTAL/VERTICAL), the two adoption paths, platform hard constraints and verification pitfalls',
  'prompt.textReplace.title': 'Bulk text replacement strategy',
  'prompt.variantSync.title': 'Bulk sync styles across sibling instances',
  'prompt.variableBinding.title': 'Bind variables and apply in bulk',
  'prompt.variantSet.title': 'Build a variant set',
  'prompt.componentProperty.title': 'Define and set component properties',
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
  'createStyle.title': 'Create a local style',
  'createStyle.description':
    'Creates one local style **from an existing node** and returns its id and name. Eight categories — the union of the three engines’ `StyleType`: PAINT / TEXT / EFFECT / GRID exist on **all three**; STROKE_WIDTH / CORNER_RADIUS / PADDING / SPACING are **MasterGo only** — the other two have no factory, so asking for them is rejected before the request, listing the categories that platform does support (never silently built as some other kind). Copying from a layer is the only shape all three platforms share: MasterGo natively does `createFillStyle({name, id: layerId})` and the engine takes the style from that layer; Figma / jsDesign expose no-arg factories, so this tool fills the new style from the node’s fills / effects / layoutGrids / text layout fields. For PAINT, fills win and strokes are the fallback (so a node with neither raises an error instead of silently creating an empty style). Mixed values (e.g. a text node using two fonts) raise an error telling you to unify the font with jsd_set_text first; the four new categories follow the same rule — SPACING / PADDING need an auto-layout container and CORNER_RADIUS needs a real corner, and when the value cannot be read the request is never sent. Bind the result by id: `jsd_set_fill_color` fillStyleId / `jsd_set_stroke` strokeStyleId / `jsd_set_text` textStyleId / `jsd_set_effects` effectStyleId — afterwards editing the style updates everywhere it is used, which is the correct way to keep a palette consistent on platforms without a variable surface. Read the catalog from `jsd://styles` (read-only resource) — ⚠ on platforms that do not declare `styleEnumeration` that catalog is always empty (all three platforms declare it today; Instant Design has listed styles since 2026-10-15, see dec e1e66f0a): it means "cannot be listed", not "none exist", so read an existing style id off a node that uses it (`*StyleId`) and keep the id returned here **on your own ledger**',
  'createStyle.followUp': 'Bind the new style id to nodes',
  'deleteStyle.title': 'Delete local styles',
  'deleteStyle.description':
    'Deletes local styles by id (pass several ids at once), one at a time: a missing id lands in the result’s failed list with a reason and does not affect the others. Ids come from jsd://styles or assets.styles in jsd_get_page (⚠ on platforms without styleEnumeration both are always empty, so take the id from a node’s *StyleId or from your own ledger) — **by id, not by name**, because same-named styles can coexist and deleting by name means guessing which one was meant. The counterpart of `jsd_create_style` (a feature is only safe to try when it can also be undone); variables are deleted with the platform op `figma_variables_remove` (Figma) / `mg_variables_remove` (MasterGo). ⚠ Nodes still referencing a deleted style keep a dangling `*StyleId` — the engine does not clean them up, so rebind them to another style first; this repo does not expose a "who uses this style" query (Figma has `getStyleConsumersAsync`, unwired)',
  'deleteStyle.followUp': 'Re-read the style list to confirm',
  'resources.title': 'Current canvas selection',
  'resources.title2': 'Available font list',
  'resources.title3': 'Local style list',
  'resources.title4':
    'Current page overview: top-level nodes + reusable asset roster',
  'resources.title5': 'Node detail',
  'resources.title6': 'Platform state and capabilities',
  'resources.title7': 'Recipe index',
  'resources.title8': 'Recipe body',
  'ping.followUp':
    'Read the current selection once the connection is confirmed. **Creation tasks: read the recipe at step 0** (hosts generally do not inject server instructions, so mcp.instructions is dropped; you must fetch it yourself): ReadMcpResource skill://canvas/SKILL.md for the index — charts/dataviz -> skill://canvas/references/chart-by-code.md, whole-page design -> skill://canvas/references/design-strategy.md + skill://canvas/references/auto-layout.md, bulk rework -> skill://canvas/references/script-ops.md. The cost of skipping is measurable: one full-screen task ran step by step with no recipe, flattened 38 nodes onto one layer, and needed multiple rounds of rework',
  'getSelection.title': 'Read canvas selection',
  'getSelection.description':
    'Read the current selection of the canvas, serialized with direct children; equivalent to jsd_get_selection depth=2',
  'getSelection.description2': 'Find nodes precisely inside the selection',
  'getPage.title':
    'Current page overview: top-level nodes + reusable asset roster',
  'getPage.description':
    'Two read-only sections for the **current page**. (1) nodes: geometry of the current page **first-level** nodes (id/name/type/width/height/x/y, not recursive); (2) assets: the reusable roster — summary gives counts for all four faces; components; variants (with dimension -> allowed values); styles (PAINT/TEXT/EFFECT/GRID, each with its type); variables. Every entry carries id and name. Scope: **styles and variables are document-level** (the engine enumeration APIs are document-level by nature); components/variants are platform-dependent — platforms that can read beyond the current page cover the whole document, those that cannot (jsDesign / MasterGo) **cover the current page only**, named in note. **This is step one of any design task: read it first, and reuse any component / variant value / style / variable that matches by name or purpose — never create a duplicate**; only build something new when the roster does not have it. A face whose capability the platform does not declare comes back as an empty array (jsDesign has no variables and cannot list styles); the reason is named in note — **an empty array does not mean the document has none**. `variants[].properties` is omitted entirely when the platform cannot read that field (never an empty object). Drill into assets by id with jsd_find. Also carries pages: each page name and its top-level node count. On dynamic-page platforms the first read loads the whole document and names that cost in note (idempotent — later calls do not reload). On platforms that cannot read beyond the current page (jsDesign / MasterGo) the roster and pages cover the current page only, also named in note — that does not mean the document has one page',
  'getPage.followUp':
    'Read a specific node serialized by id; pass scope=document to search across pages',
  'mcp.instructions':
    'Before canvas work, read skill://canvas/SKILL.md and relevant references. If skills are unavailable, use jsd_list_prompts/jsd_get_prompt or jsd://recipes. For creation, read jsd_get_page and reuse existing components, variants, styles and variables. Use semantic containers, reusable components for repeated structures and auto-layout for evenly spaced rows/columns. Root coordinates follow placement; use manual for explicit coordinates. Child coordinates are parent-relative unless layout controls them. Serialize canvas requests. Use ids for identical edits and jsd_batch for dependent steps (50 maximum; references are batch-local). recursive affects descendants; includeSelf=true includes containers. Use exact font family/style pairs from jsd_list_fonts. Read warnings, independently read back critical fields and visually inspect exported changes. Writes may have landed after a timeout; verify before retrying. Keep edits within user scope.',
  'ping.title': 'Check {client} plugin connection',
  'batch.description':
    'Run tool steps sequentially. Supply calls or callsFile (an absolute path readable by the server), at most 50 steps. Each step has id/tool/args; later args may reference paths such as {{step.created[0].id}}, valid only within this batch. Resolve existing assets with {{@comp:Name}} / {{@var:Name}}. Prefer one tool with ids for identical edits; use batch for different values or dependent tools. In compact mode, discover non-public capabilities with jsd_describe_tools before executing them here. Unknown tools are rejected. Execution errors stop by default; stopOnError/continueOnError control continuation, while plan errors still stop. A batch is not a transaction; earlier writes may remain. Read back after timeouts before replaying writes. Echoes trim subtrees and style fields; read spilled details via path/line. Verify fields with separate jsd_find and visual changes with export. checkDrift is enabled by default and reports sibling movement with original coordinates; false disables it for this call. See skill://canvas/references/script-ops.md; the recipe index is jsd://recipes.',
  'manageNodes.description':
    'Aggregate entrypoint for node structure operations dispatched by op: select | remove | clone | group | ungroup | flatten | outline_stroke | reparent | repair. For a single operation prefer the matching small tool: jsd_select_nodes / jsd_delete_node / jsd_clone_node / jsd_group_nodes / jsd_ungroup_nodes / jsd_flatten_nodes / jsd_outline_stroke / jsd_reparent_nodes / jsd_repair_nodes (their descriptions carry platform caveats and the correct flow). Property edits belong to jsd_set_* (incl. jsd_set_shape); component/instance work belongs to jsd_manage_components or jsd_create_component / jsd_sync_overrides — ops are not interchangeable.\nResult keys per op (needed to write correct jsd_batch placeholders; a wrong key aborts the batch): select -> selected[and remove -> removed[are id strings; clone/outline_stroke -> created[is an array of nodes; group/flatten -> created is a single node object; ungroup -> ungrouped[is id strings; reparent -> moved[(updated[mirrors it); repair -> cleaned[is id strings.',
  'createBooleanOperation.description':
    'Create a single BOOLEAN_OPERATION node: the booleanOperation mode ({ops}) and children (at least 2 merged child nodes) are required. Only one root boolean node. Always pass a semantic name; unnamed nodes fall back to the engine default name node. Use jsd_batch for multiple roots or complex trees',
  'setFillColor.description':
    'Set fill color/gradient (fills is a Paint array, replaced wholesale rather than merged — pass existing fills you want to keep), blend mode and team-library fill styles. {warn}',
  'setText.description':
    'Modify text (TEXT nodes only): **content and typography** characters/fontSize/fontName, alignment/auto-resize/case/decoration/line-height/letter-spacing, **colour** fills/fillStyleId/blendMode, **size** width/height (pair with textAutoResize), plus Figma truncation and max lines; position x/y is not here — use jsd_move_node / jsd_resize_node. Resolve fonts with jsd_list_fonts first: family verbatim from fonts[].family, style the full name from the same entry (e.g. SourceHanSansCN-Bold, not the short "Bold") — a wrong value fails silently and falls back to the default face, and the result warnings name it. For wrapping pass width + textAutoResize:"HEIGHT" (the default WIDTH_AND_HEIGHT grows with content; width alone gets forced to NONE and the height stops tracking content — for such text, setting characters again reflows it (measured: a fixed-width-200 text whose height read back 15 re-read 82). {warn}; characters overrides work normally inside instances too',
  'ping.description':
    'Check whether the plugin is online (you must first run it inside {client} — Instant Design or Figma — and keep it running). Returns three capability tables: coreCapabilities (create/modify/structure/component/export/image, identical on both platforms); capabilities lists only the platform-difference superset (e.g. variables/componentProperties/textTruncation) — Instant Design usually has only styles while Figma also has variables/componentProperties; platformOps lists platform-specific ops available now (name/title/parameter description) — read it before calling jsd_platform_op. The reply is cached by the daemon, so you can read jsd://platform/state afterwards instead of pinging again',
  'header.more': 'More settings',
  'menu.telemetry': 'Error reporting',
  'menu.cameraLock': 'Camera lock',
  'menu.theme': 'Theme',
  'menu.locale': 'Language',
  'telemetry.title': 'Error reporting',
  'telemetry.body':
    'To keep improving the product, enabling this records plugin and service errors.',
  'telemetry.item.error': 'Error messages and stacks',
  'telemetry.item.identity':
    'Anonymous install ID (no document content or personal data)',
  'telemetry.item.version': 'Plugin and service versions',
  'telemetry.state.on': 'On',
  'telemetry.state.off': 'Off',
  'telemetry.enable': 'Enable reporting',
  'telemetry.decline': 'Not now',
  'telemetry.disable': 'Disable reporting',
} as const satisfies Record<keyof typeof MESSAGES_ZH_CN, string | null>;
