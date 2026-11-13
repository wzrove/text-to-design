import type { ErrorCode } from './error-code';
import type { ErrorReportLevel, LogScope } from './log';

/**
 * 遥测上报的**线上载荷契约**(唯一真源):字段形状 + 长度/批量上限。
 *
 * 为什么放在 shared:发送侧(`mcp-server/src/telemetry.ts` 的 `toWire`)与接收侧
 * (`telemetry/src/index.ts` 的 `errorInput`)此前各写一份字段集与上限 ——
 * 拼错字段名编译期无感知,改一侧上限另一侧不跟就是整批 400。
 *
 * 只放类型与常量,**不引 zod**:接收侧已有 zod 校验,发送侧不该被拖进 schema 依赖。
 */

/** 两侧共用的长度/批量上限。接收侧 zod 的 `.max()` 与发送侧截断取同一值 */
export const TELEMETRY_LIMITS = {
  /** 单条 `message` 字符上限 */
  messageMax: 8000,
  /** 单条 `stack` 字符上限 */
  stackMax: 20_000,
  /** `subject`(工具名/方法名)字符上限 */
  subjectMax: 200,
  /** 单批条目数上限(/v1/errors 每次最多) */
  batchMax: 50,
  /** 条目级 `id` 字符上限 */
  idMax: 100,
  /** 单条 `context` 序列化后的字节上限 */
  contextMaxBytes: 4096,
  /** 请求体字节上限(content-length 早拒) */
  bodyMaxBytes: 262_144,
} as const;

/**
 * 一条上报条目。
 *
 * `id` / `count` 是投递与聚合元数据,不在 {@link LogRecord} 里 —— 后者是
 * UI 抽屉与落盘共用的日志形状。
 */
export interface TelemetryErrorPayload {
  /** 发送端条目级 id;重发同一批时它不变 → 服务端 rollup 不重复计数 */
  id?: string;
  level: ErrorReportLevel;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  /** 同一错误的聚合次数 */
  count?: number;
  code?: ErrorCode;
  scope?: LogScope;
  subject?: string;
}

/** /v1/errors 的请求体 */
export interface TelemetryBatch {
  user: {
    /** 匿名安装标识(`~/.text-to-design/install-id` 的随机 UUID) */
    fingerprint: string;
    clientVersion?: string;
    mcpVersion?: string;
  };
  errors: TelemetryErrorPayload[];
}
