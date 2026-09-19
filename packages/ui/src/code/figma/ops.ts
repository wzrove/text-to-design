import {
  type DesignHost,
  type PlatformOp,
  resolveNodes,
} from 'text-to-design-shared';
import { z } from 'zod';

/**
 * Figma 特有流程级操作:走 MCP platform_op 通用通道。
 * 本文件在 tsconfig.code-figma.json 编译(figma 全局有完整类型)。
 * 每个 op 挂 inputSchema,插件分发前做参数边界校验。
 */

const variablesCreateSchema = z.object({
  collectionName: z.string().optional(),
  variables: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(['BOOLEAN', 'COLOR', 'FLOAT', 'STRING']),
        /** COLOR 用 {r,g,b}/{r,g,b,a}(0-1 浮点);FLOAT 用 number */
        value: z.unknown().optional(),
      }),
    )
    .min(1),
});

const variablesApplySchema = z.object({
  nodeIds: z.array(z.string()).min(1),
  boundProperty: z.string().describe('如 fills/strokes/effects/backgrounds'),
  variableId: z.string(),
});

const styleApplyByNameSchema = z.object({
  nodeIds: z.array(z.string()).min(1),
  kind: z.enum(['fill', 'stroke', 'text', 'effect']),
  styleName: z.string(),
});

const componentPropertiesSetSchema = z.object({
  nodeIds: z.array(z.string()).min(1),
  properties: z.record(
    z.string(),
    z.object({
      type: z.enum(['BOOLEAN', 'TEXT', 'VARIANT', 'INSTANCE_SWAP']),
      value: z.union([z.boolean(), z.string()]),
    }),
  ),
});

type StyleableNode = {
  fillStyleId?: string;
  strokeStyleId?: string;
  textStyleId?: string;
  effectStyleId?: string;
};

async function createVariables(
  _host: DesignHost,
  params: unknown,
): Promise<{
  collectionId: string;
  variables: { id: string; name: string }[];
}> {
  const p = params as {
    collectionName?: string;
    variables: {
      name: string;
      type: 'BOOLEAN' | 'COLOR' | 'FLOAT' | 'STRING';
      /** COLOR 用 {r,g,b} 或 {r,g,b,a}(0-1 浮点,非 hex 字符串);FLOAT 用 number */
      value?: unknown;
    }[];
  };
  if (!p.variables?.length) throw new Error('变量列表为空');
  const collectionName = p.collectionName ?? 'Variables';
  // 同名集合复用:否则每次调用都新建一个重名集合
  // dynamic-page 下 variables 的同步 getter 全部抛异常,一律走 *Async(0011)
  const existing = (
    await figma.variables.getLocalVariableCollectionsAsync()
  ).find((c) => c.name === collectionName);
  const collection =
    existing ?? figma.variables.createVariableCollection(collectionName);
  const modeId = collection.defaultModeId;
  try {
    const created: { id: string; name: string }[] = [];
    for (const v of p.variables) {
      // 同名同类型变量就地更新值(幂等补值),避免重复建变量
      const same = existing
        ? (await figma.variables.getLocalVariablesAsync(v.type)).find(
            (x) =>
              x.name === v.name && x.variableCollectionId === collection.id,
          )
        : undefined;
      const variable =
        same ??
        // dynamic-page 增量模式下 createVariable 拒收 collection id
        // ("Cannot call ... with a collection id in incremental mode"),
        // 必须传 collection 节点本身;legacy 模式两种都收,统一传节点(指纹 b300df0ec236)
        figma.variables.createVariable(v.name, collection, v.type);
      // 必须走 setValueForMode:直接写 valuesByMode 在插件运行时是空操作,
      // 变量会停在新建默认值(COLOR 默认纯白),绑定后整片渲染成白色
      if (v.value !== undefined)
        variable.setValueForMode(modeId, v.value as VariableValue);
      created.push({ id: variable.id, name: variable.name });
    }
    return { collectionId: collection.id, variables: created };
  } catch (e) {
    // 只回滚本次新建的集合;复用既有集合时不删,避免连坐删掉用户变量
    if (!existing) collection.remove();
    throw e;
  }
}

/** paints 类字段:引擎要求变量绑在 paint 自身,节点级 setBoundVariable 会抛
 * 「fills and strokes variable bindings must be set on paints directly」 */
const PAINT_BOUND_FIELDS = new Set(['fills', 'strokes', 'backgrounds']);

async function applyVariables(
  host: DesignHost,
  params: unknown,
): Promise<{ applied: string[]; failed: string[] }> {
  const p = params as {
    nodeIds: string[];
    boundProperty: string;
    variableId: string;
  };
  const variable = await figma.variables.getVariableByIdAsync(p.variableId);
  if (variable == null) throw new Error(`没有找到变量: ${p.variableId}`);
  const nodes = await resolveNodes(host, p.nodeIds);
  if (nodes.length === 0) throw new Error('没有找到要绑定变量的节点');
  const isPaintField = PAINT_BOUND_FIELDS.has(p.boundProperty);
  const paintField = p.boundProperty as 'fills' | 'strokes' | 'backgrounds';
  const applied: string[] = [];
  const failed: string[] = [];
  for (const n of nodes) {
    const target = n as unknown as Record<string, unknown>;
    if (isPaintField) {
      const paints = target[paintField];
      if (!Array.isArray(paints) || paints.length === 0) {
        failed.push(n.id);
        continue;
      }
      // 只对 SOLID 端绑 color(SOLID 的可绑字段就叫 color);渐变等其余 paint 原样保留
      target[paintField] = (paints as Paint[]).map((paint) =>
        paint.type === 'SOLID'
          ? figma.variables.setBoundVariableForPaint(paint, 'color', variable)
          : paint,
      );
      applied.push(n.id);
      continue;
    }
    try {
      (
        n as unknown as {
          setBoundVariable(property: string, variable: Variable | null): void;
        }
      ).setBoundVariable(p.boundProperty, variable);
      applied.push(n.id);
    } catch {
      failed.push(n.id);
    }
  }
  return { applied, failed };
}

/** 本地样式查找:精确名优先,退化到 trim + 忽略大小写 */
function findLocalStyleId(
  styles: { name: string; id: string }[],
  styleName: string,
): string | undefined {
  return (
    styles.find((s) => s.name === styleName)?.id ??
    styles.find(
      (s) => s.name.trim().toLowerCase() === styleName.trim().toLowerCase(),
    )?.id
  );
}

/**
 * 按名应用本地样式。注意:Plugin API 无法按名检索团队库样式
 * (库样式需 importStyleByKeyAsync 走 key),故此处只查本地样式。
 */
async function applyStyleByName(
  host: DesignHost,
  params: unknown,
): Promise<{ applied: string[] }> {
  const p = params as {
    nodeIds: string[];
    kind: 'fill' | 'stroke' | 'text' | 'effect';
    styleName: string;
  };
  // dynamic-page 下同步 getter 会抛,一律走 *Async(0011)
  const localStyles =
    p.kind === 'fill' || p.kind === 'stroke'
      ? await figma.getLocalPaintStylesAsync()
      : p.kind === 'text'
        ? await figma.getLocalTextStylesAsync()
        : await figma.getLocalEffectStylesAsync();
  const styleId = findLocalStyleId(localStyles, p.styleName);
  if (!styleId) throw new Error(`未找到本地样式: ${p.styleName}`);
  const nodes = await resolveNodes(host, p.nodeIds);
  if (nodes.length === 0) throw new Error('没有找到要应用样式的节点');
  const styleable = nodes as unknown as StyleableNode[];
  for (const n of styleable) {
    if (p.kind === 'fill') n.fillStyleId = styleId;
    else if (p.kind === 'stroke') n.strokeStyleId = styleId;
    else if (p.kind === 'text') n.textStyleId = styleId;
    else n.effectStyleId = styleId;
  }
  return { applied: nodes.map((n) => n.id) };
}

async function setComponentProperties(
  host: DesignHost,
  params: unknown,
): Promise<{ updated: string[] }> {
  const p = params as {
    nodeIds: string[];
    properties: Record<string, { type: string; value: boolean | string }>;
  };
  if (!p.properties || Object.keys(p.properties).length === 0)
    throw new Error('属性列表为空');
  const nodes = (await resolveNodes(host, p.nodeIds)).filter(
    (n) => n.type === 'INSTANCE',
  );
  if (nodes.length === 0) throw new Error('没有找到要设置属性的实例节点');
  const insts = nodes as unknown as {
    setProperties(properties: Record<string, unknown>): void;
  }[];
  for (const inst of insts) {
    // setProperties 为部分更新:未指定的属性保持现值
    // (直接整体赋 componentProperties 会把其余属性重置回默认值,且新版 API 已将其标为只读)
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p.properties)) {
      patch[k] = { type: v.type, value: v.value };
    }
    inst.setProperties(patch);
  }
  return { updated: nodes.map((n) => n.id) };
}

export const figmaOps: PlatformOp[] = [
  {
    name: 'figma_variables_create',
    title: '创建变量',
    description:
      'Figma 特有:批量创建变量(失败整体回滚)。params: { collectionName?, variables: [{name, type: BOOLEAN|COLOR|FLOAT|STRING, value?}] }。value: COLOR 用 {r,g,b} 或 {r,g,b,a}(0-1 浮点,非 hex);FLOAT 用 number;BOOLEAN 用 boolean;STRING 用 string',
    inputSchema: variablesCreateSchema,
    run: createVariables,
  },
  {
    name: 'figma_variables_apply',
    title: '绑定变量',
    description:
      'Figma 特有:给节点绑定变量。params: { nodeIds, boundProperty(如 fills/strokes/effects/backgrounds), variableId }',
    inputSchema: variablesApplySchema,
    run: applyVariables,
  },
  {
    name: 'figma_style_apply_by_name',
    title: '按名应用本地样式',
    description:
      'Figma 特有:按名称应用本地样式到节点(团队库样式无法按名检索,不在支持范围)。params: { nodeIds, kind: fill|stroke|text|effect, styleName }',
    inputSchema: styleApplyByNameSchema,
    run: applyStyleByName,
  },
  {
    name: 'figma_component_properties_set',
    title: '设置实例组件属性',
    description:
      'Figma 特有:设置实例的组件属性值。params: { nodeIds, properties: {名: {type, value}} }',
    inputSchema: componentPropertiesSetSchema,
    run: setComponentProperties,
  },
];
