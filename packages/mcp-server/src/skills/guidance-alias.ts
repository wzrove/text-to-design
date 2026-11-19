/**
 * 资源 URI → prompt 名的别名解析。
 *
 * 背景:技能入口与附录发布在 resources(`skill://canvas/…`),配方发布在 prompts
 * (`design-strategy` 等)。宿主没有资源读取接口时,模型会把 `jsd_ping` 给的
 * `skills.nextStep`(`skill://canvas/SKILL.md`)直接传给 `jsd_get_prompt`,旧实现
 * 只按配方名查表 → 「未知提示词」。这里把路径形态归一成可读目标,内容仍从
 * 同一份技能文件取,不复制正文。
 *
 * 只做**语法归一**,不判存在性:配方 id 是否存在由调用方查注册表,避免这里
 * 反向依赖 tools 层(recipe-catalog 已依赖 skills/entries)。
 */
export type GuidanceAlias = { kind: 'skill' } | { kind: 'recipe'; id: string };

const SKILL_NAMES = new Set([
  'canvas/skill',
  'canvas/skill.md',
  'skill',
  'skill.md',
]);

export function parseGuidanceAlias(raw: string): GuidanceAlias | null {
  const name = raw
    .trim()
    .replace(/^skill:\/\//i, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
  if (name === '') return null;
  if (SKILL_NAMES.has(name)) return { kind: 'skill' };

  // canvas/references/<id>[.md] 与缩写的 references/<id>[.md]
  const m = /^(?:canvas\/)?references\/([a-z0-9][a-z0-9_-]*?)(?:\.md)?$/.exec(
    name,
  );
  if (m != null) return { kind: 'recipe', id: m[1] };
  return null;
}
