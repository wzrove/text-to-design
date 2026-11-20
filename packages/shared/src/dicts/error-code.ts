/**
 * 错误类别字典(唯一真源):daemon 与插件 UI 共用的错误码。
 *
 * 存在的理由:错误原先只有裸字符串,消费者无法分类,只能在消费端用正则猜
 * (见 daemon/proxy.ts 的 isTransportError)。分类一旦靠猜,措辞变化就会静默
 * 失效。这里把类别固化到协议载荷,格式化(前缀/引导)收敛到 MCP 边界一处。
 */
export const ERROR_CODES = [
  'not_connected',
  'forward_timeout',
  'plugin_timeout',
  'cancelled',
  'engine_error',
  'invalid_args',
  'unknown_method',
  'platform_unsupported',
  'canvas_read_only',
  'skill_first_required',
  'plugin_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * 不进遥测的错误码:策略性拒绝,不是缺陷信号。
 * 上报它们只会把「用户切了模式」记成故障,噪声压掉真错误。
 */
export const NO_TELEMETRY_ERROR_CODES: ReadonlySet<ErrorCode> =
  new Set<ErrorCode>([
    // 代码模式下拦写请求(见 dicts/canvas-readonly)
    'canvas_read_only',
  ]);

/** 线上错误载荷:类别 + 人读消息。协议层只传类别,不传展示文案。 */
export type PluginError = {
  code: ErrorCode;
  message: string;
};
