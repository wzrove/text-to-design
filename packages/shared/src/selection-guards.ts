import { OBSERVED_NODE_TYPES } from './dicts/node-type';
import { PLATFORMS } from './dicts/platform';
import type { SelectionMeta, SelectionSummaryData } from './schemas/copy';

/**
 * 面板侧的 selection 帧校验(手写,不引 zod)。
 *
 * 为什么另写一份:UI 只需要这两个形状的「安全解析」,而 `schemas/copy.ts`
 * 会把整包 zod(v4 classic + json-schema-processors)拖进单文件 ui.html
 * (实测 JS 里约 130KB)。字典本身仍是唯一真源 —— 平台枚举取 PLATFORMS、
 * 节点类型取 OBSERVED_NODE_TYPES;字段规则与 zod schema 逐条对齐,两边
 * 由 tests/selection-guards.test.ts 的共享 fixture 钉住。
 */

const PLATFORM_SET: ReadonlySet<string> = new Set(PLATFORMS);
const NODE_TYPE_SET: ReadonlySet<string> = new Set(OBSERVED_NODE_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isOptionalFinite(value: unknown): boolean {
  return (
    value === undefined || (typeof value === 'number' && Number.isFinite(value))
  );
}

export function parseSelectionMeta(value: unknown): SelectionMeta | null {
  if (!isRecord(value)) return null;
  const { platform, observedAt, selectionSeq } = value;
  if (typeof platform !== 'string' || !PLATFORM_SET.has(platform)) return null;
  if (typeof observedAt !== 'string' || observedAt.length === 0) return null;
  if (
    selectionSeq !== null &&
    !(
      typeof selectionSeq === 'number' &&
      Number.isInteger(selectionSeq) &&
      selectionSeq > 0
    )
  )
    return null;
  return value as SelectionMeta;
}

export function parseSelectionSummaryData(
  value: unknown,
): SelectionSummaryData | null {
  if (!isRecord(value)) return null;
  if (typeof value.pageName !== 'string') return null;
  if (!Array.isArray(value.selection)) return null;
  for (const node of value.selection) {
    if (!isRecord(node)) return null;
    if (typeof node.id !== 'string' || node.id.length === 0) return null;
    if (typeof node.name !== 'string') return null;
    if (typeof node.type !== 'string' || !NODE_TYPE_SET.has(node.type))
      return null;
    if (!isOptionalFinite(node.width) || !isOptionalFinite(node.height))
      return null;
  }
  return value as SelectionSummaryData;
}
