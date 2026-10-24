import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { warn } from './logger';

const CONSENT_DIR = join(homedir(), '.text-to-design');
const CONSENT_PATH = join(CONSENT_DIR, 'consent.json');

/**
 * 错误上报同意的本机持久状态。
 *
 * 放 daemon 侧而不是插件 code 的 clientStorage:上报的执行方与门控必须同一侧
 * (离线攒批、上线补报都要知道用户同没同意),且面板重装不能把同意弄丢。
 * 存储是跨版本存活的外部输入:脏值/读失败一律按**未同意** —— 门控只能收紧。
 *
 * `asked` 记「首问框是否已弹过一次」:面板连上时 daemon 报给 UI,没问过就
 * 自动弹一次;任何一次显式回发(同意/拒绝/直接关掉弹窗)都算问过,之后
 * 不再主动打扰,只能从面板 ⋯ 菜单再进。
 */
let current = false;
let asked = false;

export async function initConsent(): Promise<void> {
  try {
    const raw = JSON.parse(await readFile(CONSENT_PATH, 'utf8')) as Partial<{
      granted: unknown;
      asked: unknown;
    }> | null;
    current = raw?.granted === true;
    asked = raw?.asked === true;
  } catch {
    current = false;
    asked = false;
  }
}

export function getConsent(): boolean {
  return current;
}

export function isAsked(): boolean {
  return asked;
}

/**
 * 持久化同意状态;收到任何显式值即视为「问过了」。内存值先落(门控立即
 * 生效),写盘失败只留痕不回滚 —— 重启后读不回来会退回未同意,同样满足
 * 「只收紧」。
 */
export async function writeConsent(granted: boolean): Promise<void> {
  current = granted;
  asked = true;
  try {
    await mkdir(CONSENT_DIR, { recursive: true });
    await writeFile(
      CONSENT_PATH,
      `${JSON.stringify({ granted, asked, updatedAt: new Date().toISOString() }, null, 2)}\n`,
      'utf8',
    );
  } catch (e) {
    warn(`同意状态写盘失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}
