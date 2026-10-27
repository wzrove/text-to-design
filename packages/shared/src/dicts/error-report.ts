import type { ErrorCode } from './error-code';
import type { LogScope } from './log';

/**
 * 错误上报的分类与分组口径(唯一真源):daemon 侧 logger 用它算窗口内去重键,
 * 遥测 worker 用**同一份**算跨窗口 rollup 键 —— 两边必须得出同一个串,否则
 * 客户端聚合与服务端聚合会对不上。
 *
 * 为什么不是把整条 message 当键:message 是**给人看**的自由文本,里面混着每次
 * 必变的值(桥接请求号、耗时、节点 id)。按整串比 = 永不命中 —— 实测一次批量里
 * 15 条 `响应: r… node_op … engine_error` 各占一行、count 恒为 1。
 */

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const REQ_ID_RE = /\br\d+\b/g;
const LATENCY_RE = /耗时=\d+ms/g;
const NODE_ID_RE = /\b\d+:\d+\b/g;

/** 分组键里 message 片段的上限:只留形状,不把 8KB 正文塞进索引 */
const DETAIL_MAX = 240;

/**
 * 把 message 里**每次必变**的片段抹成占位符。只抹已知的易变词,**不抹数字本身** ——
 * `HTTP 500` 与 `HTTP 404` 是两条不同的错误,合并会把信息丢掉。
 */
export function normalizeErrorMessage(message: string): string {
  return message
    .replace(UUID_RE, '<uuid>')
    .replace(REQ_ID_RE, 'r<n>')
    .replace(LATENCY_RE, '耗时=<n>ms')
    .replace(NODE_ID_RE, '<id>');
}

export interface ErrorGroupInput {
  /** 来源档位;缺省(老客户端)为空串,退化成只按 message 分组 */
  scope?: LogScope | null;
  /** 错误类别(ERROR_CODES);缺省为空串 */
  code?: ErrorCode | null;
  /** 工具名 / 插件方法名 */
  subject?: string | null;
  /** 人读正文 */
  message: string;
}

/** 分组键:`scope|code|subject|归一化 message 前 240 字` */
export function errorGroupKey(input: ErrorGroupInput): string {
  const detail = normalizeErrorMessage(input.message).slice(0, DETAIL_MAX);
  return `${input.scope ?? ''}|${input.code ?? ''}|${input.subject ?? ''}|${detail}`;
}
