import type { DesignHost, PlatformOp } from 'text-to-design-shared';
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

function createVariables(
  _host: DesignHost,
  params: unknown,
): { collectionId: string; variables: { id: string; name: string }[] } {
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
  const collection = figma.variables.createVariableCollection(
    p.collectionName ?? 'Variables',
  );
  const modeId = collection.defaultModeId;
  try {
    const created: { id: string; name: string }[] = [];
    for (const v of p.variables) {
      const variable = figma.variables.createVariable(
        v.name,
        collection.id,
        v.type,
      );
      if (v.value !== undefined)
        variable.valuesByMode[modeId] = v.value as VariableValue;
      created.push({ id: variable.id, name: variable.name });
    }
    return { collectionId: collection.id, variables: created };
  } catch (e) {
    // 原子性:任一变量创建失败即删除整个集合回滚,不留半成品
    collection.remove();
    throw e;
  }
}

function applyVariables(
  host: DesignHost,
  params: unknown,
): { applied: string[] } {
  const p = params as {
    nodeIds: string[];
    boundProperty: string;
    variableId: string;
  };
  const nodes = p.nodeIds
    .map((id) => host.getNodeById(id))
    .filter((n): n is NonNullable<typeof n> => n != null);
  if (nodes.length === 0) throw new Error('没有找到要绑定变量的节点');
  const bound = nodes as unknown as {
    setBoundVariable(property: string, variableId: string | null): void;
  }[];
  for (const n of bound) {
    n.setBoundVariable(p.boundProperty, p.variableId);
  }
  return { applied: nodes.map((n) => n.id) };
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
function applyStyleByName(
  host: DesignHost,
  params: unknown,
): { applied: string[] } {
  const p = params as {
    nodeIds: string[];
    kind: 'fill' | 'stroke' | 'text' | 'effect';
    styleName: string;
  };
  const localStyles =
    p.kind === 'fill' || p.kind === 'stroke'
      ? figma.getLocalPaintStyles()
      : p.kind === 'text'
        ? figma.getLocalTextStyles()
        : figma.getLocalEffectStyles();
  const styleId = findLocalStyleId(localStyles, p.styleName);
  if (!styleId) throw new Error(`未找到本地样式: ${p.styleName}`);
  const nodes = p.nodeIds
    .map((id) => host.getNodeById(id))
    .filter((n): n is NonNullable<typeof n> => n != null);
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

function setComponentProperties(
  host: DesignHost,
  params: unknown,
): { updated: string[] } {
  const p = params as {
    nodeIds: string[];
    properties: Record<string, { type: string; value: boolean | string }>;
  };
  if (!p.properties || Object.keys(p.properties).length === 0)
    throw new Error('属性列表为空');
  const nodes = p.nodeIds
    .map((id) => host.getNodeById(id))
    .filter((n): n is NonNullable<typeof n> => n != null)
    .filter((n) => n.type === 'INSTANCE');
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
