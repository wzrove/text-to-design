import type { ErrorCode } from 'text-to-design-shared';

/**
 * daemon 侧带类别的错误:把「错误是什么」与「展示成什么」分开。
 *
 * 之前错误只有 message,类别信息在传输中丢失,消费端只能对字符串做正则。
 * 统一成 BridgeError 后,`err()` 能从 code 单点决定前缀与 followUp,
 * 日志也能按 code 聚合。
 */
export class BridgeError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
  }
}

export function errorCodeOf(e: unknown): ErrorCode {
  return e instanceof BridgeError ? e.code : 'plugin_error';
}
