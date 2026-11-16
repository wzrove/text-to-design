export const CODE_ROLES = ['frontend', 'backend'] as const;
export type CodeRole = (typeof CODE_ROLES)[number];

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
