import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CORE_CAPABILITIES,
  HOST_CAPABILITIES,
  PLATFORMS,
} from '../packages/shared/src/dicts';
import {
  createT,
  FALLBACK_LOCALE,
  isLocale,
  isLocaleChoice,
  LOCALE_CHOICE_STORAGE_KEY,
  LOCALES,
  MESSAGES_EN,
  MESSAGES_ZH_CN,
  normalizeLocale,
  resolveUiLocale,
  SYSTEM_CHOICE,
} from '../packages/shared/src/dicts/i18n';
import {
  isLocaleSetMessage,
  toStoredChoice,
} from '../packages/shared/src/locale-channel';

/**
 * i18n 的不变式(决策见 docs/design-decisions/0016)。
 *
 * 为什么守这些:
 * - 键集/占位符这类不一致,症状是**运行期静默**的(英文界面里冒出一句中文、
 *   或插值位置空掉),没人会为此开 bug;
 * - 「源码里不许再写中文字面量」这条是整套方案能不能守住的关键 —— 只要允许
 *   「新文案顺手写中文」,键化就会被慢慢侵蚀回去。它用**棘轮**实现:已迁移的
 *   目录一旦出现中文就红,未迁移的目录在白名单里(逐批摘除),而不是一步到位
 *   要求全仓干净(否则 CI 一直红着,没人能动)。
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PLACEHOLDER = /\{(\w+)\}/g;
const KEY_SHAPE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9-]+)+$/;
const CJK = /[\u4e00-\u9fff]/;

function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((m) => m[1] as string).sort();
}

describe('i18n 文案表', () => {
  it('两份 catalog 的键集完全一致', () => {
    expect(Object.keys(MESSAGES_EN).sort()).toEqual(
      Object.keys(MESSAGES_ZH_CN).sort(),
    );
  });

  it('同键的占位符集合一致(否则某语言会漏插值)', () => {
    const mismatched: string[] = [];
    for (const key of Object.keys(
      MESSAGES_ZH_CN,
    ) as (keyof typeof MESSAGES_ZH_CN)[]) {
      const zh = placeholders(MESSAGES_ZH_CN[key]);
      const en = placeholders(MESSAGES_EN[key]);
      if (zh.join(',') !== en.join(',')) {
        mismatched.push(`${key}: zh=[${zh}] en=[${en}]`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('键名形状统一、值非空', () => {
    const bad: string[] = [];
    for (const [key, value] of Object.entries(MESSAGES_ZH_CN)) {
      if (!KEY_SHAPE.test(key)) bad.push(`键名不合规范: ${key}`);
      if (value.trim() === '') bad.push(`空文案: ${key}`);
    }
    for (const [key, value] of Object.entries(MESSAGES_EN)) {
      if (value.trim() === '') bad.push(`empty message: ${key}`);
    }
    expect(bad).toEqual([]);
  });

  it('字典加了取值就必须有文案(平台 / 能力)', () => {
    const missing: string[] = [];
    for (const platform of PLATFORMS) {
      if (!(`platform.${platform}` in MESSAGES_ZH_CN)) {
        missing.push(`platform.${platform}`);
      }
    }
    for (const cap of HOST_CAPABILITIES) {
      if (!(`capability.host.${cap}` in MESSAGES_ZH_CN)) {
        missing.push(`capability.host.${cap}`);
      }
    }
    for (const cap of CORE_CAPABILITIES) {
      if (!(`capability.core.${cap}` in MESSAGES_ZH_CN)) {
        missing.push(`capability.core.${cap}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('语言名两侧都写自称(不翻译)', () => {
    for (const locale of LOCALES) {
      expect(MESSAGES_ZH_CN[`locale.${locale}`]).toBe(
        MESSAGES_EN[`locale.${locale}`],
      );
    }
  });
});

describe('locale 解析', () => {
  it('normalizeLocale 收得进各种写法', () => {
    const zh = ['zh', 'zh-CN', 'zh_CN', 'zh-Hans', 'zh-TW', 'ZH', ' zh-CN '];
    for (const raw of zh) expect(normalizeLocale(raw), raw).toBe('zh-CN');
    const en = ['en', 'en-US', 'EN', 'en_GB'];
    for (const raw of en) expect(normalizeLocale(raw), raw).toBe('en');
  });

  it('normalizeLocale 认不出来就给 undefined(交兜底,不猜)', () => {
    for (const raw of [
      'ja-JP',
      'fr',
      'de-DE',
      '',
      '   ',
      null,
      undefined,
      42,
      {},
    ]) {
      expect(normalizeLocale(raw)).toBeUndefined();
    }
  });

  it('resolveUiLocale 优先序:用户选择 > 系统语言 > 兜底', () => {
    // ① 用户显式选择最高,系统语言说了不算
    expect(resolveUiLocale({ stored: 'en', navigatorLanguage: 'zh-CN' })).toBe(
      'en',
    );
    expect(
      resolveUiLocale({ stored: 'zh-CN', navigatorLanguage: 'en-US' }),
    ).toBe('zh-CN');
    // ② 选「跟随系统」= 回到系统语言
    expect(
      resolveUiLocale({ stored: SYSTEM_CHOICE, navigatorLanguage: 'en-US' }),
    ).toBe('en');
    // ③ 没选过 = 跟随系统(默认行为)
    expect(resolveUiLocale({ navigatorLanguage: 'zh-CN' })).toBe('zh-CN');
    expect(resolveUiLocale({ navigatorLanguage: 'en-US' })).toBe('en');
    // ④ 系统语言认不出来 → 兜底
    expect(resolveUiLocale({ navigatorLanguage: 'ja-JP' })).toBe(
      FALLBACK_LOCALE,
    );
    expect(resolveUiLocale({})).toBe(FALLBACK_LOCALE);
  });

  it('存储里的脏值一律当「没选过」', () => {
    expect(
      resolveUiLocale({ stored: 'klingon', navigatorLanguage: 'en' }),
    ).toBe('en');
    expect(resolveUiLocale({ stored: null, navigatorLanguage: 'en' })).toBe(
      'en',
    );
    expect(toStoredChoice('klingon')).toBeNull();
    expect(toStoredChoice(undefined)).toBeNull();
    expect(toStoredChoice('system')).toBe(SYSTEM_CHOICE);
    expect(toStoredChoice('en')).toBe('en');
  });

  it('isLocale / isLocaleChoice 的边界', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('en-US')).toBe(false);
    expect(isLocaleChoice(SYSTEM_CHOICE)).toBe(true);
    expect(isLocaleChoice('zh-CN')).toBe(true);
    expect(isLocaleChoice('EN')).toBe(false);
  });

  it('locale_set 消息守卫只认合法取值', () => {
    expect(isLocaleSetMessage({ type: 'locale_set', choice: 'en' })).toBe(true);
    expect(isLocaleSetMessage({ type: 'locale_set', choice: 'system' })).toBe(
      true,
    );
    expect(isLocaleSetMessage({ type: 'locale_set', choice: 'klingon' })).toBe(
      false,
    );
    expect(isLocaleSetMessage({ type: 'ui_resize', height: 1 })).toBe(false);
    expect(isLocaleSetMessage(null)).toBe(false);
  });

  it('存储键有命名空间前缀(宿主 clientStorage 是共享字典)', () => {
    expect(LOCALE_CHOICE_STORAGE_KEY.startsWith('text-to-design')).toBe(true);
  });
});

describe('t()', () => {
  it('按 locale 取文案并替换占位符', () => {
    const zh = createT('zh-CN');
    const en = createT('en');
    expect(zh('log.trigger')).toBe('日志');
    expect(en('log.trigger')).toBe('Log');
    expect(zh('header.meta.portOnly', { port: 47812 })).toBe(':47812');
    expect(zh('log.drawer.count', { shown: 2, total: 5 })).toBe('2 / 5 条');
  });

  it('缺参数时保留 {name} 字面(不静默吞掉)', () => {
    expect(createT('en')('header.meta.portOnly')).toBe(':{port}');
    expect(createT('en')('log.drawer.count', { shown: 1 })).toBe('1 / {total}');
  });

  it('同一 locale 的 t 可复用,且不串语言', () => {
    const zh = createT('zh-CN');
    const en = createT('en');
    expect(zh('selection.copy')).toBe('复制');
    expect(en('selection.copy')).toBe('Copy');
    expect(zh('selection.copy')).toBe('复制');
  });
});

/**
 * 中文棘轮的**豁免与白名单**。
 *
 * 白名单 = 尚未迁移的目录(逐批摘除,摘一批删一段),写在这里而不是注释里:
 * 它是可断言的集合,漏摘时测试会给出具体路径。
 */
const PENDING_MIGRATION_PREFIXES = [
  // B3/B4 未做:MCP 侧的目录文案、字段说明与运行期文案
  'packages/mcp-server/src/',
  'packages/shared/src/schemas/',
  'packages/shared/src/core/',
  // B1 未做:label 表之外的字典(boolean-operation / unapplied-prop / error-code …)
  'packages/shared/src/dicts/',
  // 插件 code 侧:诊断 console + 面向 MCP 的协议文案(出口不属于面板)
  'packages/ui/src/code/',
  // 测试数据
  'packages/shared/src/__tests__/',
  'packages/mcp-server/src/__tests__/',
];

/** 预期就有中文的源文件(文案真源) */
const EXPECTED_CJK_FILES = ['packages/shared/src/dicts/i18n/messages.zh-CN.ts'];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    // 测试文件跳过:里面的中文是**断言数据**(如断言切到中文后取到「日志」),
    // 不是产品文案 —— 它本来就不该跟着 locale 走
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * 去掉注释后返回「含中文字面量的代码行」。
 *
 * 行内或上一行的注释里出现 `i18n-exempt:` 时跳过该行 —— 豁免必须是**显式**的:
 * 有些中文本来就不该跟面板走(如随错误包上行给模型的 message),而白名单是目录级的,
 * 对单行太粗。
 */
function cjkCodeLines(file: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = [];
  let inBlockComment = false;
  // 豁免标记可能写成多行注释,所以「待豁免」只在遇到**代码行**时才清掉
  let exemptPending = false;
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const [index, line] of lines.entries()) {
    const exemptHere = line.includes('i18n-exempt');
    let code = line;
    if (inBlockComment) {
      const end = code.indexOf('*/');
      if (end === -1) {
        if (exemptHere) exemptPending = true;
        continue;
      }
      inBlockComment = false;
      code = code.slice(end + 2);
    }
    // JSX 注释 {/* … */} 与普通块注释同等对待
    code = code.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    const blockStart = code.indexOf('/*');
    if (blockStart !== -1) {
      const blockEnd = code.indexOf('*/', blockStart + 2);
      if (blockEnd === -1) {
        inBlockComment = true;
        code = code.slice(0, blockStart);
      } else {
        code = code.slice(0, blockStart) + code.slice(blockEnd + 2);
      }
    }
    const lineComment = code.indexOf('//');
    if (lineComment !== -1) code = code.slice(0, lineComment);

    if (CJK.test(code) && !exemptHere && !exemptPending) {
      found.push({ line: index + 1, text: line.trim() });
    }
    if (exemptHere) exemptPending = true;
    else if (code.trim() !== '') exemptPending = false;
  }
  return found;
}

describe('中文棘轮:已迁移的代码里不许再出现中文字面量', () => {
  it('只有白名单目录与文案真源可以有中文', () => {
    const offenders: string[] = [];
    for (const dir of ['packages/shared/src', 'packages/ui/src']) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const rel = file.slice(ROOT.length + 1);
        if (
          PENDING_MIGRATION_PREFIXES.some((prefix) => rel.startsWith(prefix))
        ) {
          continue;
        }
        if (EXPECTED_CJK_FILES.includes(rel)) continue;
        for (const hit of cjkCodeLines(file)) {
          offenders.push(`${rel}:${hit.line}: ${hit.text}`);
        }
      }
    }
    expect(
      offenders,
      '这些文件已迁移完 i18n,不该再出现中文字面量:改成 catalog 键(或在确实不该跟面板走的那一行加 `i18n-exempt:` 说明理由)',
    ).toEqual([]);
  });

  it('白名单目录名单本身没有失效项(目录必须存在)', () => {
    for (const prefix of PENDING_MIGRATION_PREFIXES) {
      const full = join(ROOT, prefix.replace(/\/$/, ''));
      expect(statSync(full).isDirectory(), prefix).toBe(true);
    }
  });
});
