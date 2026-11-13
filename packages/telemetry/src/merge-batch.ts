import { errorGroupKey, type TelemetryErrorPayload } from 'text-to-design-shared';
import type { errorReports } from './db/schema';

type ErrorReportInsert = typeof errorReports.$inferInsert;

/**
 * 批内按指纹合并。
 *
 * Postgres 的 `ON CONFLICT DO UPDATE` 不允许同一批里同一冲突键出现两次(报 21000),
 * 而老客户端只按原始 message 去重、归一化后仍可能撞键 —— 不先合并就是整批 500。
 *
 * 抽成纯函数是为了能脱库测(见 merge-batch.test.ts);不读库、不碰事务。
 */
export function mergeBatchByFingerprint(
  errors: readonly TelemetryErrorPayload[],
  userId: string,
): Map<string, ErrorReportInsert> {
  const rows = new Map<string, ErrorReportInsert>();
  for (const e of errors) {
    const code = e.code ?? null;
    const scope = e.scope ?? null;
    const subject = e.subject ?? null;
    const fingerprint = errorGroupKey({ scope, code, subject, message: e.message });
    const prev = rows.get(fingerprint);
    if (prev != null) {
      prev.count = (prev.count ?? 1) + (e.count ?? 1);
      continue;
    }
    rows.set(fingerprint, {
      errorId: e.id ?? null,
      userId,
      level: e.level,
      message: e.message,
      stack: e.stack ?? null,
      context: e.context ?? null,
      count: e.count ?? 1,
      fingerprint,
      code,
      scope,
      subject,
    });
  }
  return rows;
}
