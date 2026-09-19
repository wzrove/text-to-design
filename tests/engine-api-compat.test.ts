import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 引擎侧代码不许用「设计宿主运行时没有的」现代 API。
 *
 * 症状有多难查:插件产物 `target: 'es6'` 只降**语法**、不注入 **API** polyfill,
 * 于是 `Object.hasOwn(...)`(ES2022)在打包后原样留在 code.js 里,被 jsDesign 沙箱
 * 一调就抛 `TypeError: not a function` —— 报错文案里既没有 API 名、也没有文件位置,
 * 而它恰好写在所有属性类请求的必经判定口(`isPropMethod`),于是**全部** jsd_set_*
 * / move / resize 集体失败,创建类工具却完全正常,极易误判成「插件跑了旧产物」。
 * 实际排查成本:一轮定点测试 + 一段临时探针 + 一次重载插件。
 *
 * 所以把「ES2020 以后的 API 不进引擎侧源码」变成一条断言。允许的 API 基线是
 * 实测跑得通的那一档(ES2017~2019 的 Object.entries / Object.fromEntries /
 * flatMap 已在用且工作正常);确需越线时在该行注明 `engine-api-ok` 并写清原因。
 *
 * 只扫会被打进插件产物的两份源码(ui/shared);`__tests__` 跑在 Node 里,不受限。
 */
const SCAN_ROOTS = ['packages/ui/src', 'packages/shared/src'];

/** 禁用 API → { 引入版本, 替代写法 } */
const BANNED: Record<string, { since: string; use: string }> = {
  'Object.hasOwn': {
    since: 'ES2022',
    use: 'Object.prototype.hasOwnProperty.call(obj, key)',
  },
  'Object.groupBy': { since: 'ES2024', use: '自己 reduce 分组' },
  'Map.groupBy': { since: 'ES2024', use: '自己 reduce 分组' },
  structuredClone: { since: 'ES2022 全局', use: '手写深拷贝或显式逐字段复制' },
  '.replaceAll(': { since: 'ES2021', use: 'split().join() 或 replace 带 /g' },
  'Promise.any': {
    since: 'ES2021',
    use: 'Promise.all + 自行取舍,或 Promise.race',
  },
  'Promise.allSettled': { since: 'ES2020', use: '逐条 await + try/catch' },
  AggregateError: { since: 'ES2021', use: '普通 Error 拼接多条信息' },
  WeakRef: { since: 'ES2021', use: '显式持有/Maps 管理生命周期' },
  FinalizationRegistry: { since: 'ES2021', use: '显式清理钩子' },
  '.findLast(': { since: 'ES2023', use: '倒序 for 循环' },
  '.findLastIndex(': { since: 'ES2023', use: '倒序 for 循环' },
  globalThis: { since: 'ES2020', use: '显式依赖注入(宿主可能没有 globalThis)' },
};

/** 行尾标记:确需使用时写 `// engine-api-ok: <原因>` 放行该行 */
const OPT_OUT = 'engine-api-ok';

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** 去掉注释后再匹配:注释里提到某个 API 名不该被判违规 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('引擎侧 API 兼容性', () => {
  const files = SCAN_ROOTS.flatMap((root) => walk(root));

  it('扫描范围非空(防路径写错后静默通过)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('源码里没有设计宿主运行时缺失的现代 API', () => {
    const offenders: string[] = [];
    for (const file of files) {
      // 归一化 CRLF:`.replace(/\/\/.*$/,'')` 里的 `.` 不吃 `\r`、`$` 又要求串尾,
      // 于是 Windows(core.autocrlf=true)下**行尾注释整条剥不掉**,注释里提到的 API 名
      // 会被当违规(实测误报 plugin.ts 行尾注释里的 Object.hasOwn);顺带也让下面的
      // 行号与源码对齐(块注释被整体删掉时 `lines[i]` 本来就会错位)。
      const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      const lines = raw.split('\n');
      const clean = stripComments(raw).split('\n');
      for (const [api, info] of Object.entries(BANNED)) {
        clean.forEach((line, i) => {
          if (!line.includes(api)) return;
          if (lines[i]?.includes(OPT_OUT)) return;
          offenders.push(
            `${relative(process.cwd(), file)}:${i + 1} 用了 ${api}(${info.since})` +
              ` —— 引擎侧不可用,改用 ${info.use}`,
          );
        });
      }
    }
    expect(
      offenders,
      `插件产物 target=es6 不注入 API polyfill,这些调用在 jsDesign 沙箱里会抛「not a function」:\n` +
        offenders.join('\n'),
    ).toEqual([]);
  });
});
