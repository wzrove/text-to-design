import type { DesignHost, PlatformOp } from 'text-to-design-shared';

/**
 * Figma 特有流程级操作:走 MCP platform_op 通用通道。
 * 本文件在 tsconfig.code-figma.json 编译(figma 全局有完整类型)。
 */

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
      value?: unknown;
    }[];
  };
  if (!p.variables?.length) throw new Error('变量列表为空');
  const collection = figma.variables.createVariableCollection(
    p.collectionName ?? 'Variables',
  );
  const modeId = collection.defaultModeId;
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

function applyStyleByName(
  host: DesignHost,
  params: unknown,
): { applied: string[] } {
  const p = params as {
    nodeIds: string[];
    kind: 'fill' | 'stroke' | 'text' | 'effect';
    styleName: string;
  };
  const styleId =
    p.kind === 'fill'
      ? figma.getLocalPaintStyles().find((s) => s.name === p.styleName)?.id
      : p.kind === 'stroke'
        ? figma.getLocalPaintStyles().find((s) => s.name === p.styleName)?.id
        : p.kind === 'text'
          ? figma.getLocalTextStyles().find((s) => s.name === p.styleName)?.id
          : figma.getLocalEffectStyles().find((s) => s.name === p.styleName)
              ?.id;
  if (!styleId) throw new Error(`未找到样式: ${p.styleName}`);
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
    componentProperties: Record<string, unknown>;
  }[];
  for (const inst of insts) {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p.properties)) {
      next[k] = { type: v.type, value: v.value };
    }
    inst.componentProperties = next;
  }
  return { updated: nodes.map((n) => n.id) };
}

export const figmaOps: PlatformOp[] = [
  {
    name: 'figma_variables_create',
    title: '创建变量',
    description:
      'Figma 特有:批量创建变量。params: { collectionName?, variables: [{name, type: BOOLEAN|COLOR|FLOAT|STRING, value?}] }',
    run: createVariables,
  },
  {
    name: 'figma_variables_apply',
    title: '绑定变量',
    description:
      'Figma 特有:给节点绑定变量。params: { nodeIds, boundProperty(如 fills/strokes/effects/backgrounds), variableId }',
    run: applyVariables,
  },
  {
    name: 'figma_style_apply_by_name',
    title: '按名应用团队库样式',
    description:
      'Figma 特有:按样式名称应用到节点。params: { nodeIds, kind: fill|stroke|text|effect, styleName }',
    run: applyStyleByName,
  },
  {
    name: 'figma_component_properties_set',
    title: '设置实例组件属性',
    description:
      'Figma 特有:设置实例的组件属性值。params: { nodeIds, properties: {名: {type, value}} }',
    run: setComponentProperties,
  },
];
