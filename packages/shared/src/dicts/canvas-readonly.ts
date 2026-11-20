/**
 * 画布只读策略:面板复制模式为 `code` 时,只有这里列出的请求能到达插件 code 侧
 * (闸门在 UI 的 router 转发处,那是 MCP 请求进画布的唯一通道)。
 *
 * 只列**读**,其余默认按写拒绝 —— 属性引擎方法(set_* / move / resize / rename …)、
 * execute、create_svg、fill_image、create_style、delete_style 都是写;容器方法
 * (node_op / component_op)的子 op 默认也是写,读的只有 {@link CANVAS_READ_SUB_OPS} 列出的。
 *
 * 刻意**不**收进来的读:
 * - `node_op` 的 select:不改内容,但会把用户的选中夺走,代码模式下同样不该发生;
 * - `platform_op`:变量/样式/组件属性类 op 读写混在一起,按 op 名放开会随平台扩容静默失效。
 */

export const CANVAS_READ_METHODS = [
  'ping',
  'get_selection',
  'get_page',
  'find',
  'export',
  'list_fonts',
  'list_styles',
] as const;

/** 容器方法里可放行的子 op(其余子 op 一律算写) */
export const CANVAS_READ_SUB_OPS: Record<string, readonly string[]> = {
  // 实例 overrides 的快照读取,不写属性
  component_op: ['copy_overrides'],
};

const READ_METHOD_SET: ReadonlySet<string> = new Set(CANVAS_READ_METHODS);

export function isCanvasReadRequest(method: string, params: unknown): boolean {
  if (READ_METHOD_SET.has(method)) return true;
  const allowedOps = CANVAS_READ_SUB_OPS[method];
  if (allowedOps == null) return false;
  const op =
    params != null && typeof params === 'object'
      ? (params as { op?: unknown }).op
      : undefined;
  return typeof op === 'string' && allowedOps.includes(op);
}
