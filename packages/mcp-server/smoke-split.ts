import type { PluginMethod, PropMethod } from 'text-to-design-shared';
import { PROP_METHOD_FIELDS, updateSelection } from 'text-to-design-shared';
import { Bridge } from './src/bridge';
import { toolRegistrars } from './src/tools';

// ---- 假 McpServer:只捕获工具定义与回调 ----
type Reg = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: Record<string, boolean | undefined>;
  cb: (...args: unknown[]) => Promise<unknown>;
};
const tools = new Map<string, Reg>();
const fakeServer = {
  registerTool: (
    name: string,
    config: Record<string, unknown>,
    cb: unknown,
  ) => {
    tools.set(name, { name, ...config, cb: cb as Reg['cb'] } as Reg);
    return { enable() {}, disable() {} };
  },
  registerResource: () => ({ enable() {}, disable() {} }),
  registerPrompt: () => ({ enable() {}, disable() {} }),
} as never;

const NODE = { id: '1:2', name: 'T', type: 'TEXT', x: 0, y: 0 };
const RECT = { id: '1:2', name: 'R', type: 'RECTANGLE', x: 0, y: 0 };

// ---- 假插件:捕获 method + params ----
const isPropMethod = (method: PluginMethod): boolean =>
  Object.hasOwn(PROP_METHOD_FIELDS, method);

const calls: { method: PluginMethod; params: unknown }[] = [];
const bridge = new Bridge();
bridge.request = async (method, params) => {
  calls.push({ method, params });
  if (isPropMethod(method)) return { updated: [NODE] };
  if (method === 'execute') return { created: RECT };
  return {};
};

for (const register of toolRegistrars) register(fakeServer, bridge);

// ---- 引擎侧方法白名单:updateSelection 应拒绝方法外的字段、放行方法内字段 ----
const FAKE_HOST = { getNodeById: () => NODE } as never;
const guardCases: Array<[PropMethod, Record<string, unknown>, boolean]> = [
  ['set_fill', { fills: [] }, true],
  ['set_fill', { cornerRadius: 8 }, false],
  ['move', { x: 1, y: 2 }, true],
  ['move', { width: 100 }, false],
  ['rename', { name: '按钮' }, true],
  ['rename', { name: '按钮', opacity: 0.5 }, false],
  ['set_shape', { pointCount: 6 }, true],
  ['set_shape', { pointCount: 6, strokeWeight: 2 }, false],
];
let guardFail = 0;
for (const [method, props, wantOk] of guardCases) {
  let threw = false;
  try {
    await updateSelection(FAKE_HOST, { ids: ['1:2'], props }, method);
  } catch {
    threw = true;
  }
  const ok = threw !== wantOk;
  if (!ok) {
    guardFail++;
    console.log(
      `✗ 白名单 ${method} props=${JSON.stringify(props)} 期望${wantOk ? '通过' : '拒绝'}`,
    );
  }
}
console.log(
  `引擎方法白名单: ${guardCases.length - guardFail}/${guardCases.length} 通过`,
);

const names = [...tools.keys()].sort();
console.log(`工具总数: ${names.length}`);
for (const n of names) console.log(`  ${n}`);
console.log(
  '重复名:',
  names.filter((n, i) => names.indexOf(n) !== i).length ? '有' : '无',
);
console.log(
  '无入参 schema:',
  names.filter((n) => tools.get(n)?.inputSchema === undefined).join(',') ||
    '无',
);
console.log(
  '无 title:',
  names.filter((n) => tools.get(n)?.title === undefined).join(',') || '无',
);
let fail = 0;

// ---- per-type create 小工具:清单在场 + 带 title/入参 schema ----
const perTypeCreates = [
  'jsd_create_frame',
  'jsd_create_rectangle',
  'jsd_create_text',
  'jsd_create_ellipse',
  'jsd_create_line',
  'jsd_create_polygon',
  'jsd_create_star',
  'jsd_create_vector',
  'jsd_create_group',
  'jsd_create_boolean_operation',
];
const missingCreates = perTypeCreates.filter((n) => !tools.has(n));
const noSchemaCreates = perTypeCreates.filter(
  (n) => tools.get(n)?.inputSchema === undefined,
);
const noTitleCreates = perTypeCreates.filter(
  (n) => tools.get(n)?.title === undefined,
);
if (missingCreates.length || noSchemaCreates.length || noTitleCreates.length) {
  fail++;
  console.log(
    `✗ per-type create 工具缺失/缺 schema/缺 title:\n  缺失=${missingCreates.join(',')}\n  缺 schema=${noSchemaCreates.join(',')}\n  缺 title=${noTitleCreates.join(',')}`,
  );
}
console.log(
  `per-type create 工具: ${perTypeCreates.length - missingCreates.length}/${perTypeCreates.length} 在场,全带 schema+title=${noSchemaCreates.length + noTitleCreates.length === 0 ? '是' : '否'}`,
);

// ---- 聚合入口已删除:清单不得再含 jsd_update_node / jsd_create_nodes ----
const removedAggregates = ['jsd_update_node', 'jsd_create_nodes'];
const stillPresent = removedAggregates.filter((n) => tools.has(n));
if (stillPresent.length) {
  fail++;
  console.log(`✗ 聚合入口未删除: ${stillPresent.join(', ')} 仍在清单`);
}
console.log(
  `聚合入口删除: ${removedAggregates.length - stillPresent.length}/${removedAggregates.length} 已移除`,
);

function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a as Record<string, unknown>).sort();
  const kb = Object.keys(b as Record<string, unknown>).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) =>
    deepEq(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    ),
  );
}

async function invoke(
  name: string,
  args: Record<string, unknown>,
): Promise<{
  isError?: boolean;
  text: string;
  params: unknown;
  method: PluginMethod;
  followUp?: unknown;
}> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`未注册: ${name}`);
  calls.length = 0;
  const out = (await tool.cb(args, {
    mcpReq: { signal: new AbortController().signal },
  })) as {
    isError?: boolean;
    content?: { type: string; text?: string }[];
    followUp?: unknown;
  };
  return {
    isError: out.isError,
    text: (out.content ?? []).map((c) => c.text ?? '').join(' | '),
    params: calls[0]?.params,
    method: calls[0]?.method as PluginMethod,
    followUp: out.followUp,
  };
}

// ---- 正向:入参 → 下发 method/params ----
const cases: Array<
  [string, Record<string, unknown>, PluginMethod, Record<string, unknown>]
> = [
  [
    'jsd_select_nodes',
    { ids: ['1:2'] },
    'node_op',
    { op: 'select', ids: ['1:2'] },
  ],
  ['jsd_delete_node', {}, 'node_op', { op: 'remove' }],
  [
    'jsd_delete_node',
    { ids: ['1:2'], matchName: 'x' },
    'node_op',
    { op: 'remove', ids: ['1:2'], matchName: 'x' },
  ],
  [
    'jsd_clone_node',
    { ids: ['1:2'] },
    'node_op',
    { op: 'clone', ids: ['1:2'] },
  ],
  [
    'jsd_group_nodes',
    { ids: ['1:2', '1:3'], layoutMode: 'VERTICAL', itemSpacing: 8 },
    'node_op',
    {
      op: 'group',
      ids: ['1:2', '1:3'],
      layoutMode: 'VERTICAL',
      itemSpacing: 8,
    },
  ],
  [
    'jsd_ungroup_nodes',
    { ids: ['1:2'] },
    'node_op',
    { op: 'ungroup', ids: ['1:2'] },
  ],
  [
    'jsd_flatten_nodes',
    { ids: ['1:2', '1:3'] },
    'node_op',
    { op: 'flatten', ids: ['1:2', '1:3'] },
  ],
  [
    'jsd_outline_stroke',
    { ids: ['1:2'] },
    'node_op',
    { op: 'outline_stroke', ids: ['1:2'] },
  ],
  [
    'jsd_reparent_nodes',
    { ids: ['1:2'], parentId: '1:9', index: 0 },
    'node_op',
    { op: 'reparent', ids: ['1:2'], parentId: '1:9', index: 0 },
  ],
  [
    'jsd_reparent_nodes',
    { ids: ['1:2'] },
    'node_op',
    { op: 'reparent', ids: ['1:2'] },
  ],
  ['jsd_repair_nodes', {}, 'node_op', { op: 'repair' }],
  [
    'jsd_create_component',
    { ids: ['1:2'], name: 'Btn' },
    'component_op',
    { op: 'create_component', ids: ['1:2'], name: 'Btn' },
  ],
  [
    'jsd_create_instance',
    { ids: ['1:2'] },
    'component_op',
    { op: 'create_instance', ids: ['1:2'] },
  ],
  [
    'jsd_detach_instance',
    { ids: ['1:2'] },
    'component_op',
    { op: 'detach_instance', ids: ['1:2'] },
  ],
  [
    'jsd_import_component',
    { key: 'abc' },
    'component_op',
    { op: 'import_component', key: 'abc' },
  ],
  [
    'jsd_swap_component',
    { ids: ['1:2'], componentId: '1:3' },
    'component_op',
    { op: 'swap_component', ids: ['1:2'], componentId: '1:3' },
  ],
  [
    'jsd_set_instance_properties',
    { ids: ['1:2'], properties: { 状态: '禁用' } },
    'component_op',
    {
      op: 'set_instance_properties',
      ids: ['1:2'],
      properties: { 状态: '禁用' },
    },
  ],
  [
    'jsd_combine_as_variants',
    { ids: ['1:2', '1:3'] },
    'component_op',
    { op: 'combine_as_variants', ids: ['1:2', '1:3'] },
  ],
  [
    'jsd_copy_overrides',
    { sourceId: '1:2' },
    'component_op',
    { op: 'copy_overrides', sourceId: '1:2' },
  ],
  [
    'jsd_apply_overrides',
    { ids: ['1:2'], sourceId: '1:2', swapToSource: false },
    'component_op',
    {
      op: 'apply_overrides',
      ids: ['1:2'],
      sourceId: '1:2',
      swapToSource: false,
    },
  ],
  [
    'jsd_sync_overrides',
    { ids: ['1:2'], sourceId: '1:2' },
    'component_op',
    { op: 'sync_overrides', ids: ['1:2'], sourceId: '1:2' },
  ],
  [
    'jsd_set_fill_color',
    { ids: ['1:2'], fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] },
    'set_fill',
    {
      ids: ['1:2'],
      props: { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] },
    },
  ],
  [
    'jsd_set_stroke',
    { ids: ['1:2'], strokeWeight: 2 },
    'set_stroke',
    { ids: ['1:2'], props: { strokeWeight: 2 } },
  ],
  // P26:recursive / includeSelf 是定位字段,原样下发且不得漏进 props(引擎方法
  // 白名单会拒 —— 「方法 set_stroke 不接受字段: includeSelf」)
  [
    'jsd_set_stroke',
    { ids: ['1:2'], strokeWeight: 2, recursive: true },
    'set_stroke',
    { ids: ['1:2'], recursive: true, props: { strokeWeight: 2 } },
  ],
  [
    'jsd_set_stroke',
    { ids: ['1:2'], strokeWeight: 2, recursive: true, includeSelf: true },
    'set_stroke',
    {
      ids: ['1:2'],
      recursive: true,
      includeSelf: true,
      props: { strokeWeight: 2 },
    },
  ],
  [
    'jsd_set_cornerRadius',
    { ids: ['1:2'], cornerRadius: 8 },
    'set_corner_radius',
    { ids: ['1:2'], props: { cornerRadius: 8 } },
  ],
  [
    'jsd_set_text',
    { ids: ['1:2'], characters: 'hi', fontSize: 14 },
    'set_text',
    { ids: ['1:2'], props: { characters: 'hi', fontSize: 14 } },
  ],
  [
    'jsd_move_node',
    { x: 1, y: 2, rotation: 45 },
    'move',
    { props: { x: 1, y: 2, rotation: 45 } },
  ],
  [
    'jsd_resize_node',
    { ids: ['1:2'], width: 100 },
    'resize',
    { ids: ['1:2'], props: { width: 100 } },
  ],
  // resize 同时收 x/y:尺寸 + 定位一次改完(move 仍是 x/y 的语义归属方法)
  [
    'jsd_resize_node',
    { ids: ['1:2'], width: 100, x: 10, y: 20 },
    'resize',
    { ids: ['1:2'], props: { width: 100, x: 10, y: 20 } },
  ],
  [
    'jsd_set_layout',
    { ids: ['1:2'], layoutMode: 'HORIZONTAL', itemSpacing: 12 },
    'set_layout',
    { ids: ['1:2'], props: { layoutMode: 'HORIZONTAL', itemSpacing: 12 } },
  ],
  [
    'jsd_set_effects',
    { ids: ['1:2'], effects: [] },
    'set_effects',
    { ids: ['1:2'], props: { effects: [] } },
  ],
  [
    'jsd_set_visibility',
    { ids: ['1:2'], visible: false, locked: true, opacity: 0.5 },
    'set_visibility',
    { ids: ['1:2'], props: { visible: false, locked: true, opacity: 0.5 } },
  ],
  [
    'jsd_rename_node',
    { ids: ['1:2'], name: '按钮' },
    'rename',
    { ids: ['1:2'], props: { name: '按钮' } },
  ],
  [
    'jsd_set_shape',
    { ids: ['1:2'], pointCount: 6, innerRadius: 0.5 },
    'set_shape',
    { ids: ['1:2'], props: { pointCount: 6, innerRadius: 0.5 } },
  ],
  // per-type create 小工具:method=execute,params.ops 恰为单类型节点
  [
    'jsd_create_rectangle',
    { width: 100, height: 50 },
    'execute',
    { ops: [{ type: 'RECTANGLE', width: 100, height: 50 }] },
  ],
  [
    'jsd_create_rectangle',
    { width: 100, height: 50, placement: { mode: 'manual' } },
    'execute',
    {
      ops: [{ type: 'RECTANGLE', width: 100, height: 50 }],
      placement: { mode: 'manual' },
    },
  ],
  [
    'jsd_create_text',
    { characters: 'hi', fontSize: 14 },
    'execute',
    { ops: [{ type: 'TEXT', characters: 'hi', fontSize: 14 }] },
  ],
  [
    'jsd_create_frame',
    { layoutMode: 'HORIZONTAL', itemSpacing: 8 },
    'execute',
    { ops: [{ type: 'FRAME', layoutMode: 'HORIZONTAL', itemSpacing: 8 }] },
  ],
  [
    'jsd_create_ellipse',
    { width: 40, height: 40 },
    'execute',
    { ops: [{ type: 'ELLIPSE', width: 40, height: 40 }] },
  ],
];

for (const [name, args, wantMethod, wantParams] of cases) {
  const r = await invoke(name, args);
  if (r.isError || r.method !== wantMethod || !deepEq(r.params, wantParams)) {
    fail++;
    console.log(
      `✗ ${name} isError=${r.isError}\n  method=${r.method}(期望 ${wantMethod})\n  params=${JSON.stringify(r.params)}\n  期望=${JSON.stringify(wantParams)}\n  text=${r.text.slice(0, 200)}`,
    );
  }
}
console.log(`正向: ${cases.length - fail}/${cases.length} 通过`);

// ---- 负例:越界字段 / 缺必填 ----
const neg: Array<[string, Record<string, unknown>]> = [
  ['jsd_set_fill_color', { ids: ['1:2'], fontSize: 14 }],
  ['jsd_move_node', { ids: ['1:2'], fills: [] }],
  ['jsd_set_text', { ids: ['1:2'], cornerRadius: 8 }],
  ['jsd_set_layout', { ids: ['1:2'], width: 100 }],
  ['jsd_flatten_nodes', { ids: ['1:2'] }],
  ['jsd_group_nodes', { layoutMode: 'VERTICAL' }],
  ['jsd_import_component', { name: 'x' }],
  ['jsd_swap_component', { ids: ['1:2'] }],
  ['jsd_set_instance_properties', { ids: ['1:2'] }],
  ['jsd_rename_node', { ids: ['1:2'] }],
  ['jsd_clone_node', {}],
  // per-type create:strict 拒绝注入 type 字面量(工具已固化)、拒绝跨类型字段
  ['jsd_create_rectangle', { type: 'RECTANGLE', width: 100 }],
  ['jsd_create_rectangle', { characters: 'hi' }],
  ['jsd_create_text', { width: 100 }], // 文本必填 characters
  ['jsd_create_frame', { characters: 'hi' }],
  ['jsd_create_ellipse', { pointCount: 6 }], // 椭圆无 pointCount
  ['jsd_create_boolean_operation', { booleanOperation: 'UNION' }], // 缺 children(至少 2)
];
const before = fail;
for (const [name, args] of neg) {
  const tool = tools.get(name);
  if (!tool) continue;
  const parsed = (
    tool.inputSchema as {
      safeParse: (v: unknown) => {
        success: boolean;
        error: { issues: { path: PropertyKey[]; message: string }[] };
      };
    }
  ).safeParse(args);
  if (parsed.success) {
    fail++;
    console.log(`✗ 负例 ${name} 应被 schema 拒绝却通过`);
  }
}
console.log(
  `负例: ${neg.length} 个全部正确拒绝=${fail === before ? '是' : '否'}`,
);

// ---- 反馈文案:类型不匹配字段点名 / 未命中 id 点名 ----
const fb1 = await invoke('jsd_set_text', { ids: ['1:2'], characters: 'hi' });
console.log(
  '反馈(矩形被误当文本改圆角→应点名):',
  JSON.stringify(
    await invoke('jsd_set_cornerRadius', { ids: ['1:2'], cornerRadius: 4 }),
  ).slice(0, 120),
);
console.log('反馈(文本改 characters):', fb1.text.slice(0, 160));
// resize 带 x/y:几何字段永远生效,不该被点名成「类型不匹配,已被忽略」
const fbXY = await invoke('jsd_resize_node', {
  ids: ['1:2'],
  width: 100,
  x: 10,
  y: 20,
});
if (fbXY.text.includes('与目标节点类型不匹配')) {
  fail++;
  console.log(`✗ resize 传 x/y 触发误报: ${fbXY.text.slice(0, 200)}`);
}
console.log(
  '反馈(缺 id 点名):',
  JSON.stringify(await invoke('jsd_move_node', { x: 1 })).slice(0, 200),
);
// 类型不匹配:把 TEXT 当 FRAME 设布局
bridge.request = async (m, p) => {
  calls.push({ method: m, params: p });
  return { updated: [RECT] };
};
const fb2 = await invoke('jsd_set_layout', { ids: ['1:2'], itemSpacing: 12 });
console.log('反馈(矩形设布局→应点名):', fb2.text.slice(0, 240));

// ---- P22:batch 步骤回显摘要裁剪(图标的 vectorPaths 不再撑爆整批结果) ----
bridge.request = async (m, p) => {
  calls.push({ method: m, params: p });
  if (m === 'execute') {
    return {
      created: {
        ...RECT,
        id: '9:9',
        width: 24,
        height: 24,
        vectorPaths: [
          { windingRule: 'NONZERO', data: 'M0 0L24 24 '.repeat(60) },
        ],
      },
    };
  }
  return {};
};
const batchEcho = await invoke('jsd_batch', {
  calls: [
    { id: 'ic', tool: 'jsd_create_rectangle', args: { width: 24, height: 24 } },
  ],
});
const echoKeptId = batchEcho.text.includes('"9:9"');
const echoDroppedPaths = !batchEcho.text.includes('vectorPaths');
if (batchEcho.isError || !echoKeptId || !echoDroppedPaths) {
  fail++;
  console.log(
    `✗ batch 回显裁剪异常: isError=${batchEcho.isError} 保留 id=${echoKeptId} 丢弃 vectorPaths=${echoDroppedPaths}\n  ${batchEcho.text.slice(0, 300)}`,
  );
}
console.log(
  `batch 回显裁剪: 保留 id/坐标=${echoKeptId} 丢 vectorPaths=${echoDroppedPaths} echoTrimmed 标记=${batchEcho.text.includes('echoTrimmed')}`,
);

// 裁剪后仍超预算(20K)→ 再降一级为 id 清单,绝不把整批结果撑出上下文
bridge.request = async (m, p) => {
  calls.push({ method: m, params: p });
  if (m === 'find') {
    return {
      total: 600,
      nodes: Array.from({ length: 600 }, (_, i) => ({
        ...RECT,
        id: `9:${i}`,
        name: `图标${i}`,
        vectorPaths: [
          { windingRule: 'NONZERO', data: 'M0 0L24 24 '.repeat(40) },
        ],
      })),
    };
  }
  return {};
};
const batchHuge = await invoke('jsd_batch', {
  calls: [{ id: 't', tool: 'jsd_find', args: { ids: ['1:2'] } }],
});
const omitted = batchHuge.text.includes('echoOmitted');
const keptIdOnly =
  batchHuge.text.includes('9:0') && batchHuge.text.includes('9:599');
if (batchHuge.isError || !omitted || !keptIdOnly) {
  fail++;
  console.log(
    `✗ batch 超预算降级异常: isError=${batchHuge.isError} echoOmitted=${omitted} 保留 id 清单=${keptIdOnly}\n  ${batchHuge.text.slice(0, 300)}`,
  );
}
console.log(
  `batch 超预算降级: echoOmitted=${omitted} 保留 id 清单=${keptIdOnly} 长度=${batchHuge.text.length}`,
);

// ---- P25-B:batch 入参支持 checkDrift(默认开);关掉时不做任何额外读数 ----
bridge.request = async (m, p) => {
  calls.push({ method: m, params: p });
  if (m === 'node_op' && (p as { op?: string }).op === 'remove') {
    return { removed: ['1:2'] };
  }
  return {};
};
const batchNoDrift = await invoke('jsd_batch', {
  calls: [{ id: 'del', tool: 'jsd_delete_node', args: { ids: ['1:2'] } }],
  checkDrift: false,
});
if (batchNoDrift.isError || calls.length !== 1) {
  fail++;
  console.log(
    `✗ batch checkDrift=false 异常: isError=${batchNoDrift.isError} 插件调用次数=${calls.length}(应恰为 1)`,
  );
}
console.log(
  `batch checkDrift 开关: 接受=false 时不做额外读数(${calls.length === 1 ? '是' : `否,${calls.length} 次`})`,
);

// ---- followUp 引导:结果带 followUp 指向下一步(参照 server.ts) ----
bridge.request = async (m, p) => {
  calls.push({ method: m, params: p });
  if (isPropMethod(m)) return { updated: [NODE] };
  if (m === 'execute') return { created: RECT };
  if (m === 'find') return { nodes: [NODE] };
  return {};
};
const followCases: [string, Record<string, unknown>, string][] = [
  ['jsd_find', { ids: ['1:2'] }, 'jsd_select_nodes'],
  ['jsd_create_rectangle', { width: 100, height: 50 }, 'jsd_batch'],
  [
    'jsd_set_fill_color',
    { ids: ['1:2'], fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] },
    'jsd_set_stroke',
  ],
  ['jsd_set_shape', { ids: ['1:2'], pointCount: 6 }, 'jsd_set_fill_color'],
];
let fupFail = 0;
for (const [name, args, wantTool] of followCases) {
  const r = await invoke(name, args);
  const f = r.followUp as { type?: string; tool?: string } | undefined;
  if (r.isError || f == null || f.type !== 'tool' || f.tool !== wantTool) {
    fupFail++;
    console.log(
      `✗ followUp ${name}: isError=${r.isError} followUp=${JSON.stringify(r.followUp)} 期望 tool=${wantTool}`,
    );
  }
}
console.log(
  `followUp 结果引导: ${followCases.length - fupFail}/${followCases.length} 通过`,
);
