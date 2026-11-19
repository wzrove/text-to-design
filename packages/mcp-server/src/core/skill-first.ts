import {
  CANVAS_RECIPE_ROOT,
  CANVAS_SKILL_ROOT,
  CANVAS_SKILL_URI,
  type MessageKey,
} from 'text-to-design-shared';
import type { McpI18n } from '../i18n';

/**
 * 「连上先读操作指引,再写画布」的会话级硬门禁。
 *
 * 会话级归属沿用 dec 7044aa46:账挂在 shim 的 McpServer 实例上;daemon 的池化实例
 * 跨会话复用,不能拿它当会话身份。与当时的「拒一次后放行」不同,这里未读到任一
 * 指引前持续拒绝所有非只读工具 —— 等待或重复调用不会自动放行。
 */
const READ_GUIDANCE = new WeakSet<object>();

export function markGuidanceRead(server: object): void {
  if (!READ_GUIDANCE.has(server)) READ_GUIDANCE.add(server);
}

export function hasReadGuidance(server: object): boolean {
  return READ_GUIDANCE.has(server);
}

/** 返回 veto 文案(拒绝)或 null(放行);写入判据由工具目录的 readOnlyHint 提供 */
export function guidanceFirstVeto(
  server: object,
  isWrite: boolean,
  i18n: McpI18n,
): { message: string; code: 'skill_first_required' } | null {
  if (!isWrite || READ_GUIDANCE.has(server)) return null;
  return {
    code: 'skill_first_required',
    message: i18n.t('skillFirst.required' as MessageKey, {
      uri: CANVAS_SKILL_URI,
    }),
  };
}

/** 技能入口、技能附录、配方资源都算「读到操作指引」;列目录不算 */
export function isCanvasGuidanceUri(uri: string): boolean {
  const target = String(uri).replace(/\/+$/, '');
  return (
    target === CANVAS_SKILL_ROOT ||
    target.startsWith(`${CANVAS_SKILL_ROOT}/`) ||
    target === CANVAS_RECIPE_ROOT ||
    target.startsWith(`${CANVAS_RECIPE_ROOT}/`)
  );
}
