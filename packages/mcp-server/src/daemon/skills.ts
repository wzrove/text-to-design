import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SkillCatalog } from '@modelcontextprotocol/server/ext/skills';
import { loadSkills } from '@modelcontextprotocol/server/ext/skills/node';
import { debug, warn } from '../logger';

/**
 * 把 `dist/skills` 下的配方技能发布出去(Skills over MCP,SEP-2640,SDK ≥ 2.4.0)。
 *
 * ## 为什么要多做这一层:配方此前只有「被动」入口
 *
 * 配方已经作为 MCP resource 暴露(`jsd://recipes/*`),但通路的实际到达率取决于模型
 * **想不想**去读 —— `tools/list` 里只留一行指针,没人替它做决定。实测教训:画图表
 * 时跳过 `chart-by-code`、从零设计时跳过 `design-strategy` 与 `auto-layout`,一路
 * 手拼节点,返工六轮。skills 是客户端**主动发现**的能力位:模型不需要先知道有个
 * resource 才去读。
 *
 * ## 为什么技能文件是**构建期生成**的
 *
 * 正文的单一真源在 `tools/prompts.ts` 的 render 函数(食谱目录与 prompts/resource
 * 共用同一批函数)。运行时再渲染一次会分裂成两份正文;所以 `scripts/gen-skills.ts`
 * 在 build 末尾调用同一批函数,把成品 SKILL.md 写进 `dist/skills/<id>/`。
 *
 * ## 失败必须不致命
 *
 * skills 目录不存在(开发态直跑 `tsx src/index.ts`)、frontmatter 不合法、文件超限 ——
 * 都只降级成「没有 skills」,daemon 照常提供 53 个工具。这类扩展失败不许连坐主功能。
 */
export async function loadSkillsCatalog(): Promise<SkillCatalog | null> {
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'skills');
  try {
    const catalog = await loadSkills(dir);
    debug(`skills: ${catalog.entries.length} 条已发布(${dir})`);
    return catalog;
  } catch (e) {
    warn(
      `skills 未发布(工具照常可用): ${e instanceof Error ? e.message : String(e)} (${dir})`,
    );
    return null;
  }
}
