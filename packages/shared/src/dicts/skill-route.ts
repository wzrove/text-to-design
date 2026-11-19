/**
 * 画布技能与配方路由的唯一真源(daemon 的 skills 发布、ping 回包、shim 门禁共用一处)。
 *
 * 从前这些 URI 散在 i18n 文案与 skills/*.ts 里各抄一份,改目录结构时必漏。
 */
export const CANVAS_SKILL_ROOT = 'skill://canvas';
export const CANVAS_SKILL_URI = `${CANVAS_SKILL_ROOT}/SKILL.md`;
export const CANVAS_RECIPE_ROOT = 'jsd://recipes';
