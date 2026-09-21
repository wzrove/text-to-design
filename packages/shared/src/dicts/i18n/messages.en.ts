import type { MESSAGES_ZH_CN } from './messages.zh-CN';

/**
 * English catalog.
 *
 * `satisfies` 而不是普通字面量:键必须与 `MESSAGES_ZH_CN` **完全一致** ——
 * 漏译(少键)编译报错,多译(多键)也编译报错。占位符的一致性由
 * `tests/i18n.test.ts` 守(类型系统看不到 `{}` 里的名字)。
 *
 * 术语与 `ui.html` 的面板宽度同源:文案要短,面板只有 360px 宽。
 */
export const MESSAGES_EN = {
  'platform.jsdesign': 'jsDesign',
  'platform.figma': 'Figma',

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
} as const satisfies Record<keyof typeof MESSAGES_ZH_CN, string>;
