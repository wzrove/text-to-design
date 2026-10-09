/** 构建期由 vite define 注入(见 vite.config.ts 与 0038) */
declare const __APP_VERSION__: string;

/**
 * 面板自身版本。
 *
 * 用 define 注入而不是 `import package.json`:本包 tsconfig 没开
 * `resolveJsonModule`(见 vite.config.ts 的说明)。`typeof` 守卫是给非构建环境
 * (单测直接引这个模块)兜底的 —— 那时常量未定义,取占位串而不是抛 ReferenceError。
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/**
 * 取纯数字前缀:`0.10.0` → [0,10,0];`1.2.3-beta.1` → [1,2,3]。
 *
 * 先按 `-` 砍掉预发布后缀:`1.0.1-beta.1` 切成 `.` 后第三段是 `1-beta`,
 * 直接停会连补丁号一起丢掉(得到 [1,0]);而取前导数字(`parseInt('1-beta')`=1)
 * 又会让它变成 [1,0,1,1]、反倒比 `1.0.1` 还新。砍掉后缀后预发布与正式版同档,
 * 正好符合「预发布不算更新」。
 */
function numericSegments(v: string): number[] | null {
  const out: number[] = [];
  for (const part of (v.split('-')[0] ?? '').split('.')) {
    if (!/^\d+$/.test(part)) break;
    out.push(Number(part));
  }
  return out.length > 0 ? out : null;
}

/**
 * `latest` 是否新于 `current`。
 *
 * 拿不到事实(latest 为 null、任一侧不可解析)一律返回 **false** —— 升级提示是
 * 「有新版」的断言,查不到就该闭嘴;报一个错的升级建议比不报更糟(见 0038)。
 * 只比数字段,故 `0.9.0 < 0.10.0` 成立(字符串比较会得出相反结论)。
 */
export function isOutdated(current: string, latest: string | null): boolean {
  if (latest == null) return false;
  const a = numericSegments(current);
  const b = numericSegments(latest);
  if (a == null || b == null) return false;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (y > x) return true;
    if (y < x) return false;
  }
  return false;
}
