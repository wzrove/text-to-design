import { dirname } from 'node:path';
import type { SkillCatalog } from '@modelcontextprotocol/server/ext/skills';
import { loadSkills } from '@modelcontextprotocol/server/ext/skills/node';
import { debug, warn } from '../logger';
import { SKILL_DIR } from '../skills/entries';

// skills 加载失败只降级扩展，不阻断基础工具。
export async function loadSkillsCatalog(): Promise<SkillCatalog | null> {
  const dir = dirname(SKILL_DIR);
  try {
    const catalog = await loadSkills(dir);
    debug(`skills: ${catalog.entries.length} 条已发布(${dir})`);
    reportSkillsPublished(catalog.entries.length, null);
    return catalog;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    warn(`skills 未发布(工具照常可用): ${reason} (${dir})`);
    reportSkillsPublished(0, reason);
    return null;
  }
}

/**
 * 最近一次 skills 发布结果,给 `jsd_ping` 回包与 `jsd://platform/state` 读。
 *
 * ## 为什么要把这个状态暴露出去
 *
 * 发布失败时只走 `warn()` 落日志,客户端侧毫无感知 —— 而「没有 skills」和
 * 「skills 发布了但宿主没注入」在模型眼里长得一模一样:两种情况都表现为
 * 「技能目录里没有 design / charts / components / bulk-ops」。
 *
 * 2026-11 实测:模型整屏任务全程单步调用、没读任何配方(服务端 `dist/skills`
 * 里 4 条技能其实都在),返工多轮。事后无法从会话内判断该怪服务端还是怪宿主。
 * 这个字段就是那次的答案:模型可自查「服务端到底发出来没有」,从而决定
 * 该去读 `jsd://recipes`(服务端 ok、宿主没注入)还是报告发布故障。
 */
let skillsStatus: { published: boolean; count: number; error?: string } | null =
  null;

function reportSkillsPublished(count: number, error: string | null): void {
  skillsStatus = {
    published: error == null && count > 0,
    count,
    ...(error != null ? { error } : {}),
  };
}

/** 供 `jsd_ping` 回包与平台状态缓存读取;daemon 尚未装配 skills 时为 null */
export function getSkillsStatus(): {
  published: boolean;
  count: number;
  error?: string;
} | null {
  return skillsStatus;
}
