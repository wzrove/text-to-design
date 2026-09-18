import type { McpServer } from '@modelcontextprotocol/server';
import {
  type BatchParams,
  type BatchResult,
  batchResultSchema,
  batchSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { BATCH_TIMEOUT_MS } from '../config';
import {
  bridgeTool,
  executorNames,
  lookupExecutor,
  type ToolHandle,
} from '../core/registry';

/** 按点分路径(含 a[0].b 下标段)从步骤结果根对象取值;任一段不可达视为失败 */
function getPath(
  root: unknown,
  path: string,
): { ok: true; value: unknown } | { ok: false } {
  let cur: unknown = root;
  for (const part of path.split('.')) {
    const m = /^([\w$\u4e00-\u9fff-]*)((?:\[\d+\])*)$/.exec(part.trim());
    if (m == null) return { ok: false };
    if (m[1] !== '') {
      if (cur == null || typeof cur !== 'object') return { ok: false };
      cur = (cur as Record<string, unknown>)[m[1]];
    }
    if (m[2] !== '') {
      for (const idx of m[2].matchAll(/\[(\d+)\]/g)) {
        if (!Array.isArray(cur)) return { ok: false };
        cur = cur[Number(idx[1])];
      }
    }
  }
  return { ok: true, value: cur };
}

/** 解析单个引用表达式 'stepId.a.b[0]';步骤不存在/路径不可达时抛错(附可用步骤) */
function resolveRef(expr: string, steps: Map<string, unknown>): unknown {
  const dot = expr.indexOf('.');
  const id = dot === -1 ? expr : expr.slice(0, dot);
  const path = dot === -1 ? '' : expr.slice(dot + 1);
  if (!steps.has(id)) {
    const known = [...steps.keys()].join(', ') || '无';
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
 * 渲染无关且体积会失控的整键字段(P22):vectorPaths 是元凶 —— settings 图标单条
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

/** 深度裁剪:节点对象只留摘要字段,大字段整键丢弃,其余结构原样保留 */
function trimEcho(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(trimEcho);
  if (value == null || typeof value !== 'object') return value;
  const src = value as Record<string, unknown>;
  if (
    typeof src.id === 'string' &&
    typeof src.type === 'string' &&
    typeof src.name === 'string'
  ) {
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
 */
function echoStep(structured: unknown): { data: unknown; trimmed: boolean } {
  const data = trimEcho(structured);
  const size = jsonSize(data);
  if (size <= ECHO_BUDGET_CHARS) {
    return { data, trimmed: size !== jsonSize(structured) };
  }
  const ids: string[] = [];
  collectIds(data, ids);
  return {
    data: {
      echoOmitted: true,
      note: `本步回显裁剪后仍 ${size} 字符,已省略明细;需要细节请把该工具单独调用一次`,
      ids: [...new Set(ids)],
    },
    trimmed: true,
  };
}

/** 深度遍历入参:引用占位符独占整值时保留原类型;内嵌于长字符串时以 JSON 文本展开 */
function resolveRefs(value: unknown, steps: Map<string, unknown>): unknown {
  if (typeof value === 'string') {
    const whole = WHOLE_REF_RE.exec(value.trim());
    if (whole != null) return resolveRef(whole[1], steps);
    return value.replace(REF_RE, (_, expr: string) => {
      const v = resolveRef(expr, steps);
      return typeof v === 'string' ? v : JSON.stringify(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, steps));
  if (value != null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveRefs(v, steps);
    return out;
  }
  return value;
}

/** 编排类:服务端顺序执行多步 jsd_* 工具,中间值经占位符注入、不回传模型 */
export function registerBatchTools(
  server: McpServer,
  bridge: Bridge,
): ToolHandle[] {
  const batch = bridgeTool({
    name: 'jsd_batch',
    title: '批量编排执行',
    description: `批量编排器:一次请求内顺序执行多个 jsd_* 步骤,前一步结果经双花括号占位符(内容为 步骤id.字段路径)注入后一步 args,中间 id 不回传模型,显著减少往返与上下文。
占位符独占一个参数值时保留原类型(数组可直接作 ids 用),嵌在字符串中按 JSON 文本展开;id 重复/未知工具/引用失败立即中止,工具执行失败默认也中止(stopOnError=false 或单步 continueOnError=true 可走完)。
回显已做摘要裁剪:节点对象只留 id/name/type/x/y/width/height/z/parentId,vectorPaths(单条 >10KB、16 位小数)与 constraints 等渲染无关字段整键丢弃;裁剪后仍超 20K 字符的步骤降级为 id 清单(结果里 echoTrimmed=true)。占位符解析不受影响(内部仍用完整数据)。含图标的批次(jsd_create_icon / jsd_clone_node / jsd_create_vector)务必配一次 jsd_export 目视验收,别只看回显。
各工具返回键与占位符写法(键写错会报「无法解析占位符引用」并中止整批):
· created 为数组 → {{id.created[0].id}}:per-type create(jsd_create_rectangle / jsd_create_frame 等)、jsd_clone_node、jsd_outline_stroke、jsd_create_instance、jsd_detach_instance
· created 为单对象 → {{id.created.id}}:jsd_create_svg / jsd_create_icon / jsd_flatten_nodes / jsd_group_nodes / jsd_create_component / jsd_import_component / jsd_combine_as_variants
· jsd_find → {{id.nodes[0].id}};jsd_get_selection → {{id.selection[0].id}}
· 属性类 jsd_set_* → {{id.updated[0].id}};jsd_swap_component → {{id.swapped[0].id}}
· jsd_manage_nodes 各 op:select→selected[](id 字符串)、remove→removed[](id 字符串)、clone/group/flatten/outline_stroke→created[]、ungroup→ungrouped[](id 字符串)、reparent→moved[](与 updated[] 同义,两个键都回)、repair→cleaned[](id 字符串)—— id 字符串数组取 {{id.selected[0]}},节点数组取 {{id.created[0].id}}
· jsd_manage_components 各 op:create_component/create_instance/detach_instance/import_component/combine_as_variants→created(detach_instance 是数组,不是 updated)、swap_component→swapped[]、set_instance_properties→updated[]、copy_overrides→snapshotId、apply_overrides/sync_overrides→applied[]
· 拿不准某步的返回结构时,先单独调它一次看回显再拼进 batch —— 猜错会连带整批中止。
结构变更复核(默认开,checkDrift=false 可关):步骤里含 remove/reparent/group/ungroup/flatten/repair 时,变更前记下受影响父层(含 reparent 的目标父级与当前页顶层)的子节点坐标,收尾再读一次比对 —— 引擎在删改结构后会把**没碰到**的兄弟节点静默挪走(实测 (24,720)→(28,618):无报错、回显正常,渲染上像样式问题,极易走错排查方向)。漂移写进结果 warnings 并给出原值,照原值用 jsd_move_node 回填即可;覆盖面仅限本次操作触及的父层(协议没有整树读法,别的层漂移查不到)。`,
    inputSchema: batchSchema,
    outputSchema: batchResultSchema,
    // calls 里可能带 remove/flatten 等破坏性 op,如实标注
    annotations: { readOnlyHint: false, destructiveHint: true },
    followUp: {
      type: 'tool',
      tool: 'jsd_get_selection',
      description: '编排执行后复核画布结果',
    },
    timeout: BATCH_TIMEOUT_MS,
    run: async (args, _bridge, signal) => {
      const { calls, stopOnError, checkDrift } = args as BatchParams;
      const steps = new Map<string, unknown>();
      const results: BatchResult['results'] = [];
      let echoTrimmed = false;
      // P25-B 复核不再由 batch 自己做:结构变更类工具在注册时就挂了漂移复核钩子,
      // 单工具调用与编排内调用走同一条路(此前只有 batch 内的步骤有复核)。
      // checkDrift=false 时按「本次调用不实例化钩子」传给执行体 —— 开关是按调用的,
      // 不是全局开关,也不是把钩子从 def 上摘掉。
      const skipHooks = checkDrift === false;
      const stepWarnings: string[] = [];
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        const id =
          call.id == null || call.id.trim() === ''
            ? `step${i + 1}`
            : call.id.trim();
        const fail = (msg: string): void => {
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
          resolvedArgs = resolveRefs(call.args ?? {}, steps) as Record<
            string,
            unknown
          >;
        } catch (e) {
          fail(e instanceof Error ? e.message : String(e));
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
        // 占位符解析用完整数据,回显用裁剪后的摘要(P22):两者分离,
        // 剪掉 vectorPaths 不会让下游 {{id.created[0].id}} 解析失败。
        const echo = echoStep(out.structuredContent);
        if (echo.trimmed) echoTrimmed = true;
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
      return {
        ok: complete && results.every((r) => r.ok),
        executed: results.length,
        total: calls.length,
        results,
        ...(echoTrimmed ? { echoTrimmed: true } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    },
  });
  return [batch(server, bridge)];
}
