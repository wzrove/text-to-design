export const CODE_ROLES = ['frontend', 'backend'] as const;
export type CodeRole = (typeof CODE_ROLES)[number];

/**
 * 角色归一化放在 dicts 而不是 node-reference:UI 面板也要用它,
 * 而 node-reference 依赖 zod schema(URL 编解码);放在一起会把整包 zod
 * 拖进 300KB 的 ui.html(实测 sourcemap 里 zod 约 1/3)。
 * 这里只依赖 CODE_ROLES,纯函数、可被 tree-shake。
 */
export function normalizeCodeRoles(values: readonly unknown[]): CodeRole[] {
  if (values.length === 0)
    throw new Error('code Copy 至少选择 frontend 或 backend'); // i18n-exempt: MCP/URL diagnostics, not panel copy
  const unknown = values.filter(
    (value) =>
      typeof value !== 'string' ||
      !(CODE_ROLES as readonly string[]).includes(value),
  );
  if (unknown.length > 0) {
    throw new Error(`不支持的 code 职责: ${unknown.map(String).join(', ')}`); // i18n-exempt: MCP/URL diagnostics, not panel copy
  }
  return CODE_ROLES.filter((role) => values.includes(role));
}

export const NODE_REFERENCE_VERSION = 1;
export const COPY_REQUEST_TIMEOUT_MS = 60_000;

export const DESIGN_TO_CODE_SKILL_ROUTE = {
  skillId: 'design-to-code',
  contractVersion: 2,
  scriptStrategy: 'llm-generated',
  entry: 'SKILL.md',
  dataContractReference: 'data-contract',
  roleReferences: {
    frontend: 'frontend',
    backend: 'backend',
  },
  integrationReference: 'integration',
  scriptGenerationReference: 'script-generation',
} as const;
