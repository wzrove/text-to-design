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
占位符独占一个参数值时保留原类型(数组可直接作 ids 用),嵌在字符串中按 JSON 文本展开;id 重复/未知工具/引用失败立即中止,工具执行失败默认也中止(stopOnError=false 或单步 continueOnError=true 可走完)。每步只回传 structuredContent。`,
    inputSchema: batchSchema,
    outputSchema: batchResultSchema,
    // calls 里可能带 remove/flatten 等破坏性 op,如实标注
    annotations: { readOnlyHint: false, destructiveHint: true },
    timeout: BATCH_TIMEOUT_MS,
    run: async (args, _bridge, signal) => {
      const { calls, stopOnError } = args as BatchParams;
      const steps = new Map<string, unknown>();
      const results: BatchResult['results'] = [];
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
        const out = (await executor(resolvedArgs, signal)) as {
          isError?: boolean;
          structuredContent?: unknown;
          content?: { type: string; text?: string }[];
        };
        if (out.isError === true) {
          const text =
            out.content?.find((c) => c.type === 'text')?.text ?? '工具返回错误';
          fail(text.slice(0, 300));
          if (!(stopOnError === false || call.continueOnError === true)) break;
          continue;
        }
        steps.set(id, out.structuredContent);
        results.push({
          id,
          tool: call.tool,
          ok: true,
          data: out.structuredContent,
        });
      }
      const complete = results.length === calls.length;
      return {
        ok: complete && results.every((r) => r.ok),
        executed: results.length,
        total: calls.length,
        results,
      };
    },
  });
  return [batch(server, bridge)];
}
