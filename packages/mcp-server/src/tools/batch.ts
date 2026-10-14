import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import {
  type BatchParams,
  type BatchResult,
  batchResultSchema,
  batchSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { BATCH_TIMEOUT_MS, MAX_BATCH_SPILL_BYTES } from '../config';
import { loadBatchCallsFile } from '../core/calls-file';
import {
  bridgeTool,
  executorNames,
  lookupExecutor,
  type ToolHandle,
} from '../core/registry';
import type { McpI18n } from '../i18n';

/**
 * 按点分路径(含 a[0].b 下标段)从步骤结果根对象取值;任一段不可达视为失败。
 *
 * created/updated 是数组还是单对象随工具而异,写占位符时最容易猜反。两种形状
 * 各只有一种无歧义读法时互认:单元素数组按对象取字段(`created.id`≈`created[0].id`)、
 * 单对象取下标 0(`created[0]`≈`created`)。多元素数组不认(歧义),照旧报错。
 */
function getPath(
  root: unknown,
  path: string,
): { ok: true; value: unknown } | { ok: false } {
  let cur: unknown = root;
  for (const part of path.split('.')) {
    const m = /^([\w$\u4e00-\u9fff-]*)((?:\[\d+\])*)$/.exec(part.trim());
    if (m == null) return { ok: false };
    if (m[1] !== '') {
      if (Array.isArray(cur) && cur.length === 1) cur = cur[0];
      if (cur == null || typeof cur !== 'object') return { ok: false };
      cur = (cur as Record<string, unknown>)[m[1]];
    }
    if (m[2] !== '') {
      for (const idx of m[2].matchAll(/\[(\d+)\]/g)) {
        const i = Number(idx[1]);
        if (!Array.isArray(cur)) {
          if (i === 0 && cur != null && typeof cur === 'object') continue;
          return { ok: false };
        }
        cur = cur[i];
      }
    }
  }
  return { ok: true, value: cur };
}

/**
 * 占位符引用了一个**已执行但失败**的步骤(区别于「这个 id 根本不存在」)。
 *
 * 为什么要分类:前者说明计划本身是对的,只是那一步的返回没拿到 —— 该受
 * `stopOnError` / `continueOnError` 管,和普通执行期失败一视同仁;后者是计划写错了,
 * 一律中止。此前两者共用一条「一律 break」的分支,于是文档里承诺的
 * 「stopOnError=false 可走完全部」在占位符这条路径上是空承诺 ——
 * 实测一批 33 步只跑了 12 步就整批中止,而画布上其实已经改好了
 * (触发源见 `docs/design-decisions/0044`:输出过不了 schema 也会被标成失败)。
 */
class StepFailedRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StepFailedRefError';
  }
}

/** 解析单个引用表达式;步骤不存在/路径不可达时抛错(附可用步骤) */
function resolveStepRef(
  expr: string,
  steps: Map<string, unknown>,
  failed: ReadonlySet<string>,
): unknown {
  const dot = expr.indexOf('.');
  const id = dot === -1 ? expr : expr.slice(0, dot);
  const path = dot === -1 ? '' : expr.slice(dot + 1);
  if (!steps.has(id)) {
    const known = [...steps.keys()].join(', ') || '无';
    if (failed.has(id)) {
      throw new StepFailedRefError(
        `占位符「${expr}」引用的步骤「${id}」执行失败,本步未执行。修掉那一步,或用 stopOnError=false / 该步 continueOnError=true 跳过引用它的步骤(已成功的步骤: ${known})`,
      );
    }
    throw new Error(
      `占位符引用的步骤不存在或未成功:「${expr}」(已完成: ${known})`,
    );
  }
  const root = steps.get(id);
  if (path === '') return root;
  const r = getPath(root, path);
  if (!r.ok) {
    throw new Error(
      `无法解析占位符引用「${expr}」:请核对步骤 ${id} 的返回结构`,
    );
  }
  return r.value;
}

/**
 * 资源寻址占位符:`{{@comp:按钮}}` / `{{@var:accent/blue}}` → 资源 id。
 *
 * 为什么需要:此前占位符只认**本批步骤的结果**(步骤表随调用结束销毁),于是
 * 「用哪个组件建实例」「把这个填充绑到哪个变量」都得先在批次外查一次 id 再硬写进
 * args —— 名字是本仓最稳的资源标识,而 id 每次都要重新摸。
 * 与 `@` 前缀不撞车:步骤 id 用 `.` 分段,不允许出现 `@` 开头。
 */
const ASSET_RE = /^@(comp|var):([\s\S]+)$/;

/** `jsd_get_page` 回包里资源清单的部分形状 */
interface PageAssets {
  components?: { id: string; name: string }[];
  variants?: { id: string; name: string }[];
  variables?: { id: string; name: string }[];
}

/** 一次取名只读一遍文档:同批多个 `@` 引用共用同一份 assets */
type AssetLoader = () => Promise<PageAssets>;

/** 同类资源里按名字找 id:精确名 → trim + 忽略大小写;零命中/多命中都点名,不猜 */
function pickAssetId(
  kind: 'comp' | 'var',
  name: string,
  pool: { id: string; name: string }[],
): string {
  const want = name.trim();
  const label = kind === 'comp' ? '组件/变体集' : '变量';
  const exact = pool.filter((a) => a.name === want);
  const hits =
    exact.length > 0
      ? exact
      : pool.filter((a) => a.name.trim().toLowerCase() === want.toLowerCase());
  if (hits.length === 1) return hits[0].id;
  if (hits.length > 1) {
    throw new Error(
      `按名字取${label}「${name}」撞上 ${hits.length} 个同名资源:${hits
        .map((h) => `${h.name}(${h.id})`)
        .join(
          '、',
        )}。名字不唯一时改用 id 直接写,或先重命名(0041:不确定就点名,绝不猜)。`,
    );
  }
  const known = pool.slice(0, 30).map((a) => a.name);
  throw new Error(
    `按名字取${label}「${name}」没命中。${
      known.length === 0
        ? `这一面当前读不到任何${label}(两种原因都可能:本平台未声明该能力面,或本平台读不到非当前页 —— 到底哪种见 jsd_get_page 回包的 note)`
        : `现有${label}:${known.join('、')}${pool.length > known.length ? ' …' : ''}`
    };也可以直接写 id。`,
  );
}

async function resolveAssetRef(
  kind: 'comp' | 'var',
  name: string,
  load: AssetLoader,
): Promise<string> {
  const assets = await load();
  const pool =
    kind === 'comp'
      ? [...(assets.components ?? []), ...(assets.variants ?? [])]
      : (assets.variables ?? []);
  return pickAssetId(kind, name, pool);
}

const REF_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

const WHOLE_REF_RE = /^\{\{\s*([^{}]+?)\s*\}\}$/;

/**
 * 回显里逐节点保留的字段:批处理只需要「认节点」(拿 id 拼后续步骤、确认落到哪),
 * 渲染细节与嵌套大字段一律不回传。顺序即输出顺序,便于人读。
 */
const ECHO_NODE_FIELDS = [
  'id',
  'name',
  'type',
  'x',
  'y',
  'width',
  'height',
  'z',
  'parentId',
] as const;

/**
 * 渲染无关且体积会失控的整键字段:vectorPaths 是元凶 —— settings 图标单条
 * 路径 >10KB 且 16 位小数,两个图标 + 其余步骤回显叠加就到 146K 字符,整批结果被
 * 挤出上下文(落盘到 tool-results/*.txt,模型看不到 ok / 报错,等于盲执行);
 * clone 图标更是 281K。constraints / 包围盒对批处理同样无用,一并丢弃。
 */
const ECHO_DROP_FIELDS = new Set([
  'vectorPaths',
  'constraints',
  'absoluteBoundingBox',
  'absoluteRenderBounds',
]);

/** 裁剪后仍超此长度就再降一级:只回 id 清单,绝不把结果撑出上下文 */
const ECHO_BUDGET_CHARS = 20000;

function jsonSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 节点对象的判据:`id` + `name` + `type` 三个字符串**不够** —— 样式与变量的摘要
 * 恰好也是这三个字段(`StyleSummary` / `AssetRef`),于是 `figma_style_variables_list`
 * 回包里的 `values` 与 `boundVariables` 会被整片收掉,批内「写完回读」读到的是空壳,
 * 看起来就像没生效(dec 0007 的形态)。真节点一定带几何或父级,拿它当判别位。
 */
const NODE_SHAPE_FIELDS = ['x', 'y', 'width', 'height', 'parentId'] as const;

function looksLikeNode(src: Record<string, unknown>): boolean {
  if (
    typeof src.id !== 'string' ||
    typeof src.type !== 'string' ||
    typeof src.name !== 'string'
  )
    return false;
  return NODE_SHAPE_FIELDS.some((k) => src[k] !== undefined);
}

/**
 * 深度裁剪:节点对象只留摘要字段,大字段整键丢弃,其余结构原样保留。
 * 导出只为让不变式测试能直接喂形状(`__tests__/echo-trim.test.ts`)—— 判据错了的
 * 症状是「回包成功、字段没了」,拿端到端用例去撞太贵。
 */
export function trimEcho(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(trimEcho);
  if (value == null || typeof value !== 'object') return value;
  const src = value as Record<string, unknown>;
  if (looksLikeNode(src)) {
    const node: Record<string, unknown> = {};
    for (const k of ECHO_NODE_FIELDS) {
      if (src[k] !== undefined) node[k] = src[k];
    }
    return node;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (ECHO_DROP_FIELDS.has(k)) continue;
    out[k] = trimEcho(v);
  }
  return out;
}

/** 递归收集结果里出现过的节点 id,作超预算时的兜底载荷 */
function collectIds(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const v of value) collectIds(v, out);
    return;
  }
  if (value == null || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === 'id' && typeof v === 'string') {
      out.push(v);
      continue;
    }
    collectIds(v, out);
  }
}

/**
 * 单步回显:先裁摘要,仍超预算再降级为 id 清单。占位符解析走的是 steps 里的
 * **完整**结构化数据,不受这里影响 —— 裁剪只影响回显给模型看的量。
 *
 * 两个标记都回给调用方记账(dec 0007):`trimmed` = 这步的节点被摘要化过(子节点、
 * characters、fills、*StyleId 等都不在回显里),`omitted` = 连摘要都超预算、只剩 id 清单。
 * 裸的 `echoTrimmed` 布尔读不出「哪几步被裁、裁掉了什么」—— 那正是「回显成功、
 * 画面空白」被误判成工具没干活的入口,故由 batch 汇总成一句可读的 note。
 */
function echoStep(
  structured: unknown,
  tool: string,
): { data: unknown; trimmed: boolean; omitted: boolean } {
  const data = trimEcho(structured);
  const size = jsonSize(data);
  if (size <= ECHO_BUDGET_CHARS) {
    return { data, trimmed: size !== jsonSize(structured), omitted: false };
  }
  const ids: string[] = [];
  collectIds(data, ids);
  return {
    data: {
      echoOmitted: true,
      note: `本步回显裁剪后仍 ${size} 字符,已省略明细;需要细节请把 ${tool} 单独调用一次`,
      ids: [...new Set(ids)],
    },
    trimmed: true,
    omitted: true,
  };
}

/**
 * 裁剪汇总:把「哪几步被裁、缺了什么字段、要明细怎么办」写成人话。
 *
 * 为什么不能只回布尔:节点一旦被摘要化,`children` 与 `characters` / `fills` /
 * `*StyleId` 就整片不在回显里 —— 调用方看起来就是「子节点没了 / 字段没生效」。
 * 真机 2026-10-15 实测踩过:批内 `jsd_find(depth:1)` 只回 frame 本体,同一条查询
 * 单独直调才回出子树。这类误读的成本是一次白跑的排查,而提示的成本只有一行字。
 */
function echoNoteText(
  trimmed: readonly string[],
  omitted: readonly string[],
  spill?: { path: string; bytes: number },
): string {
  const parts = [
    `回显已裁剪:${trimmed.length} 步(${trimmed.join(' / ')})的节点只保留 id/name/type/x/y/width/height/z/parentId`,
    ' —— 子节点、characters、fills、*StyleId、vectorPaths 等字段不在回显里。',
    '要读这些字段,请把对应工具**单独调用一次**;批内回显不是验收证据。',
    '占位符 `{{步骤id.…}}` 不受影响,它取的是裁剪前的完整数据。',
  ];
  if (omitted.length > 0) {
    parts.push(
      spill == null
        ? `其中 ${omitted.length} 步(${omitted.join(' / ')})连摘要都超预算,已降级为 id 清单,步骤内的 note 已点名工具名。`
        : `其中 ${omitted.length} 步(${omitted.join(' / ')})连摘要都超预算,完整明细已落盘到 ${spill.path}(${spill.bytes} 字节,JSONL 一行一步),按各步 data 里的 line 读即可。`,
    );
  }
  return parts.join('');
}

/** 同一毫秒内多次落盘时的去重序号:文件名要可排序、且不互相覆盖 */
let spillSeq = 0;

/**
 * 明细落盘:整批结果写成 JSONL(一行一步),回显里只给路径 —— 预算外的东西仍然拿得到,
 * 但要「可寻址」,不是「塞回上下文」。
 *
 * 为什么整批一个文件、而不是每步一个:一批最多 50 步,逐步入栈会堆出几十个碎文件;
 * JSONL 一行一步恰好对应「按步分片读」,批与文件一一对应也好回收。
 * 为什么每行都带 id/tool/ok:文件是**复核**用的,失败步骤也要在文件里对得上号 ——
 * 只写成功步骤的 data,「这一步到底跑没跑」在文件里就查无实据。
 * 路径与 jsd_export 的自动落盘同源(tmpdir + 时间戳文件名),不另立目录约定。
 * 超上限或写盘失败都**不静默**:退回 id 清单,由调用方记进 warnings(dec 0007)。
 */
function spillBatch(
  results: readonly { id: string; tool: string; ok: boolean; error?: string }[],
  steps: ReadonlyMap<string, unknown>,
):
  | { path: string; bytes: number; line: Map<string, number> }
  | { error: string } {
  const lines: string[] = [];
  const line = new Map<string, number>();
  for (const r of results) {
    line.set(r.id, lines.length + 1);
    lines.push(
      JSON.stringify(
        r.ok
          ? { id: r.id, tool: r.tool, ok: true, data: steps.get(r.id) }
          : { id: r.id, tool: r.tool, ok: false, error: r.error },
      ),
    );
  }
  const text = `${lines.join('\n')}\n`;
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_BATCH_SPILL_BYTES) {
    return { error: `明细 ${bytes} 字节 > 上限 ${MAX_BATCH_SPILL_BYTES} 字节` };
  }
  const path = join(
    tmpdir(),
    `jsd-batch-${Date.now().toString(36)}-${++spillSeq}.jsonl`,
  );
  try {
    writeFileSync(path, text, 'utf8');
  } catch (e) {
    return { error: `写盘失败:${e instanceof Error ? e.message : String(e)}` };
  }
  return { path, bytes, line };
}

/** 深度遍历入参:引用占位符独占整值时保留原类型;内嵌于长字符串时以 JSON 文本展开 */
async function resolveRefs(
  value: unknown,
  steps: Map<string, unknown>,
  loadAssets: AssetLoader,
  failed: ReadonlySet<string>,
): Promise<unknown> {
  const one = async (expr: string): Promise<unknown> => {
    const asset = ASSET_RE.exec(expr.trim());
    return asset != null
      ? resolveAssetRef(asset[1] as 'comp' | 'var', asset[2], loadAssets)
      : resolveStepRef(expr, steps, failed);
  };
  if (typeof value === 'string') {
    const whole = WHOLE_REF_RE.exec(value.trim());
    if (whole != null) return one(whole[1]);
    // 字符串里的多个引用要按出现顺序逐个替换
    let out = '';
    let last = 0;
    for (const m of value.matchAll(REF_RE)) {
      out += value.slice(last, m.index);
      const v = await one(m[1]);
      out += typeof v === 'string' ? v : JSON.stringify(v);
      last = (m.index ?? 0) + m[0].length;
    }
    return last === 0 ? value : out + value.slice(last);
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const v of value)
      out.push(await resolveRefs(v, steps, loadAssets, failed));
    return out;
  }
  if (value != null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value))
      out[k] = await resolveRefs(v, steps, loadAssets, failed);
    return out;
  }
  return value;
}

/** 编排类:服务端顺序执行多步 jsd_* 工具,中间值经占位符注入、不回传模型 */
export function registerBatchTools(
  server: McpServer,
  bridge: Bridge,
  i18n: McpI18n,
): ToolHandle[] {
  const batch = bridgeTool({
    name: 'jsd_batch',
    title: 'batch.title',
    description: 'batch.description',
    inputSchema: batchSchema,
    outputSchema: batchResultSchema,
    // calls 里可能带 remove/flatten 等破坏性 op,如实标注
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    followUp: {
      type: 'tool',
      tool: 'jsd_get_selection',
      description: 'batch.followUp',
    },
    timeout: BATCH_TIMEOUT_MS,
    run: async (args, bridge, signal) => {
      const {
        calls: inlineCalls,
        callsFile,
        stopOnError: inlineStopOnError,
        checkDrift: inlineCheckDrift,
      } = args as BatchParams;
      // 清单来源二选一:内联 calls,或一个 JSON 文件的绝对路径(id 不进上下文)。
      // 两个都给会让「哪份生效」变成猜测,所以点名拒绝而不是挑一个用。
      const fromFile =
        callsFile == null || callsFile.trim() === ''
          ? null
          : await loadBatchCallsFile(callsFile);
      if (fromFile != null && inlineCalls != null)
        throw new Error(
          'calls 与 callsFile 只能给一个:calls 在本批内直接执行,callsFile 从文件读同一份清单。两个都给会让「哪份生效」变成猜。',
        );
      if (fromFile == null && inlineCalls == null)
        throw new Error(
          '需要 calls 或 callsFile 其中一个(都缺省时没有步骤可执行)。参数体大到写不进上下文时,把清单写进 JSON 文件、这里只传它的绝对路径。',
        );
      const calls = fromFile?.calls ?? inlineCalls ?? [];
      const stopOnError = fromFile?.stopOnError ?? inlineStopOnError;
      const checkDrift = fromFile?.checkDrift ?? inlineCheckDrift;
      const steps = new Map<string, unknown>();
      const results: BatchResult['results'] = [];
      let echoTrimmed = false;
      // 被裁 / 被降级的步骤名:汇总成 echoNote 时要逐步点名,别只回一个裸布尔
      const trimmedSteps: string[] = [];
      const omittedSteps: string[] = [];
      // 复核不再由 batch 自己做:结构变更类工具在注册时就挂了漂移复核钩子,
      // 单工具调用与编排内调用走同一条路(此前只有 batch 内的步骤有复核)。
      // checkDrift=false 时按「本次调用不实例化钩子」传给执行体 —— 开关是按调用的,
      // 不是全局开关,也不是把钩子从 def 上摘掉。
      const skipHooks = checkDrift === false;
      const stepWarnings: string[] = [];
      // 资源清单按需读一次:占位符里的 `{{@comp:…}}` / `{{@var:…}}` 共用同一份快照,
      // 批次内不做二次读(名字寻址不该比硬编码 id 更贵)。批后新建的资源不在快照里,
      // 那是刻意的:同批刚建就按名字取,等于赌引擎已刷新。
      let assetsPromise: Promise<PageAssets> | undefined;
      const loadAssets: AssetLoader = () => {
        assetsPromise ??= (async () => {
          const assets = await bridge.request(
            'get_page',
            {},
            {
              ...(signal != null ? { signal } : {}),
            },
          );
          return (assets as { assets?: PageAssets })?.assets ?? {};
        })();
        return assetsPromise;
      };
      // 已执行但失败的步骤 id:占位符引用到它们时走 StepFailedRefError(受容错开关管),
      // 与「id 根本不在计划里」区分开。
      const failedSteps = new Set<string>();
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        const id =
          call.id == null || call.id.trim() === ''
            ? `step${i + 1}`
            : call.id.trim();
        const fail = (msg: string): void => {
          failedSteps.add(id);
          results.push({ id, tool: call.tool, ok: false, error: msg });
        };
        // ---- 编排期错误:计划本身有问题,一律中止 ----
        if (steps.has(id) || results.some((r) => r.id === id)) {
          fail(`步骤 id "${id}" 重复`);
          break;
        }
        const executor = lookupExecutor(call.tool);
        if (executor == null) {
          fail(`未知工具 ${call.tool},可用: ${executorNames().join(', ')}`);
          break;
        }
        let resolvedArgs: Record<string, unknown>;
        try {
          resolvedArgs = (await resolveRefs(
            call.args ?? {},
            steps,
            loadAssets,
            failedSteps,
          )) as Record<string, unknown>;
        } catch (e) {
          fail(e instanceof Error ? e.message : String(e));
          // 引用了「已执行但失败」的步骤:计划没问题,只是上游没拿到 ——
          // 与执行期失败同等对待,让容错开关生效;引用了计划里根本没有的 id 才是
          // 编排期错误,一律中止。
          if (
            e instanceof StepFailedRefError &&
            (stopOnError === false || call.continueOnError === true)
          ) {
            continue;
          }
          break;
        }
        // ---- 执行期:受 stopOnError/continueOnError 控制 ----
        const out = (await executor(resolvedArgs, signal, { skipHooks })) as {
          isError?: boolean;
          structuredContent?: unknown;
          content?: { type: string; text?: string }[];
          warnings?: string[];
        };
        if (out.isError === true) {
          const text =
            out.content?.find((c) => c.type === 'text')?.text ?? '工具返回错误';
          fail(text.slice(0, 300));
          if (!(stopOnError === false || call.continueOnError === true)) break;
          continue;
        }
        // 占位符解析用完整数据,回显用裁剪后的摘要:两者分离,
        // 剪掉 vectorPaths 不会让下游 {{id.created[0].id}} 解析失败。
        const echo = echoStep(out.structuredContent, call.tool);
        if (echo.trimmed) {
          echoTrimmed = true;
          trimmedSteps.push(id);
        }
        if (echo.omitted) omittedSteps.push(id);
        steps.set(id, out.structuredContent);
        if (out.warnings != null) stepWarnings.push(...out.warnings);
        results.push({
          id,
          tool: call.tool,
          ok: true,
          data: echo.data,
        });
      }
      const complete = results.length === calls.length;
      const warnings = stepWarnings;
      // 有步骤被降级成 id 清单时,把整批明细落盘、并在那几步上补 path / line。
      // 落盘失败**不当作批失败**:退回 id 清单 + warnings 点名,调用方照样能重取。
      const spilled =
        omittedSteps.length === 0 ? undefined : spillBatch(results, steps);
      const spill = spilled != null && 'error' in spilled ? undefined : spilled;
      if (spilled != null && 'error' in spilled) {
        warnings.push(
          `本批有 ${omittedSteps.length} 步回显超预算,但完整明细未落盘(${spilled.error});已保留 id 清单,要明细请把对应工具单独调用一次。`,
        );
      }
      if (spill != null) {
        for (const r of results) {
          if (!omittedSteps.includes(r.id)) continue;
          const data = r.data as Record<string, unknown> | undefined;
          const ln = spill.line.get(r.id);
          if (data == null || data.echoOmitted !== true || ln == null) continue;
          r.data = {
            ...data,
            path: spill.path,
            line: ln,
            note: `本步明细已随整批落盘(第 ${ln} 行);也可把 ${r.tool} 单独调用一次。`,
          };
        }
      }
      return {
        ok: complete && results.every((r) => r.ok),
        executed: results.length,
        total: calls.length,
        results,
        ...(echoTrimmed ? { echoTrimmed: true } : {}),
        ...(echoTrimmed
          ? { echoNote: echoNoteText(trimmedSteps, omittedSteps, spill) }
          : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    },
  });
  return [batch(server, bridge, i18n)];
}
