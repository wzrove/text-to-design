import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGN_TO_CODE_SKILL_ROUTE } from 'text-to-design-shared';
import { frontmatterName, referencedInBody } from './entries';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DESIGN_TO_CODE_DIR = join(
  HERE,
  ...(basename(HERE) === 'dist'
    ? ['skills', DESIGN_TO_CODE_SKILL_ROUTE.skillId]
    : [DESIGN_TO_CODE_SKILL_ROUTE.skillId]),
);
export const DESIGN_TO_CODE_ENTRY = join(
  DESIGN_TO_CODE_DIR,
  DESIGN_TO_CODE_SKILL_ROUTE.entry,
);
export const CODE_INDEX_URI = 'jsd://code';
export const CODE_URI_TEMPLATE = 'jsd://code/{entry}';

export const CODE_REFERENCE_IDS = [
  DESIGN_TO_CODE_SKILL_ROUTE.dataContractReference,
  DESIGN_TO_CODE_SKILL_ROUTE.roleReferences.frontend,
  DESIGN_TO_CODE_SKILL_ROUTE.roleReferences.backend,
  DESIGN_TO_CODE_SKILL_ROUTE.integrationReference,
  DESIGN_TO_CODE_SKILL_ROUTE.scriptGenerationReference,
] as const;

export const CODE_ENTRY_IDS = [
  DESIGN_TO_CODE_SKILL_ROUTE.entry,
  ...CODE_REFERENCE_IDS,
] as const;

const ENTRY_FILES: Record<string, string> = {
  [DESIGN_TO_CODE_SKILL_ROUTE.entry]: DESIGN_TO_CODE_ENTRY,
  ...Object.fromEntries(
    CODE_REFERENCE_IDS.map((id) => [
      id,
      join(DESIGN_TO_CODE_DIR, 'references', id + '.md'),
    ]),
  ),
};

export function readCodeEntry(entry: string): string {
  const file = ENTRY_FILES[entry];
  if (file == null) {
    throw new Error(
      '未知 code 资源:' + entry + '(可用 entry:' + CODE_ENTRY_IDS.join(', ') + ')',
    );
  }
  return readFileSync(file, 'utf8');
}

export function completeCodeEntryIds(value: string): string[] {
  return CODE_ENTRY_IDS.filter((id) => id.startsWith(value));
}

export function assertDesignToCodeSkill(): void {
  const body = readCodeEntry(DESIGN_TO_CODE_SKILL_ROUTE.entry);
  const name = frontmatterName(body);
  if (name !== DESIGN_TO_CODE_SKILL_ROUTE.skillId) {
    throw new Error('design-to-code frontmatter name 不匹配:' + String(name));
  }
  const version = /^contractVersion:\s*(\d+)$/m.exec(body)?.[1];
  if (version !== String(DESIGN_TO_CODE_SKILL_ROUTE.contractVersion)) {
    throw new Error('design-to-code contractVersion 必须为 2');
  }
  const onDisk = readdirSync(join(DESIGN_TO_CODE_DIR, 'references'))
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.replace(/\.md$/, ''))
    .sort();
  const expected = [...CODE_REFERENCE_IDS].sort();
  const referenced = referencedInBody(body);
  if (
    JSON.stringify(onDisk) !== JSON.stringify(expected) ||
    JSON.stringify(referenced) !== JSON.stringify(expected)
  ) {
    throw new Error(
      'design-to-code 附录引用不完整(磁盘:' +
        onDisk.join(',') +
        ';入口:' +
        referenced.join(',') +
        ')',
    );
  }
}

export function renderCodeIndex(): string {
  return [
    '# design-to-code 契约 v2',
    '',
    '处理 jsd://node 或 jsd://canvas/selection 节点引用。先读入口和 data-contract，再按 roles 读取附录；资源与 skill://design-to-code 下文件同源。',
    '',
    '- jsd://code/SKILL.md — 入口、目标固定、项目检查与交付闭环',
    '- jsd://code/data-contract — 所有 roles 必读的数据与三平台补读规则',
    '- jsd://code/frontend — roles 含 frontend 时读取',
    '- jsd://code/backend — roles 含 backend 时读取',
    '- jsd://code/integration — 双选时与 frontend/backend 一起读取',
    '- jsd://code/script-generation — 需要生成任务脚本时读取',
    '',
    '链接必须为 v=1；code 空或未知 roles 明确报错。节点详情由后续 skill 按 IDs 补读。资源只读，不是脚本执行 API。',
  ].join('\n');
}
