import {
  type CodeRole,
  type CopyRequest,
  normalizeCodeRoles,
  type SelectionSummarySnapshot,
} from 'text-to-design-shared';

/**
 * 构造一次 jsd_copy 请求。面板里有两个入口(选中卡按钮、最小化宠物单击),
 * source / ids / mode 的组合只在这里写一份 —— 两边各拼一次,迟早一边忘了
 * 带 selectionSeq 或 fallback 的 pageName。
 */
export function makeCopyRequest(
  snapshot: SelectionSummarySnapshot,
  mode: CopyRequest['mode'],
  roles: readonly CodeRole[],
  scope: CopyRequest['scope'],
  requestedIds: readonly string[],
): CopyRequest {
  const base = {
    scope,
    requestedIds: [...requestedIds],
    source: {
      platform: snapshot.meta?.platform ?? null,
      pageName: snapshot.data?.pageName ?? null,
      selectionSeq: snapshot.meta?.selectionSeq ?? null,
    },
  };
  return mode === 'code'
    ? { ...base, mode: 'code', roles: normalizeCodeRoles(roles) }
    : { ...base, mode: 'design' };
}
