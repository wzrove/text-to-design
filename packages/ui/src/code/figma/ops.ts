import {
  type DesignHost,
  type PlatformOp,
  resolveNodes,
  toComponentPropertyWrites,
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
        /** 建变量的入口只有 `VariableResolvedDataType` 这 6 种(`plugin-api.d.ts:11571` + `createVariable` 重载 :2176/:2188);`EXPRESSION` / `VARIABLE_ALIAS` 是**值形态**,不是可建类型 */
        type: z.enum([
          'BOOLEAN',
          'COLOR',
          'EASING',
          'FLOAT',
          'STRING',
          'TIMING',
        ]),
        /**
         * 按 `VariableValue`(:11588)的形状给:BOOLEAN 布尔 / STRING 字符串 /
         * FLOAT·TIMING 数字 / COLOR 用 `{r,g,b}` 或 `{r,g,b,a}`(**0-1 浮点,不是 hex**)/
         * EASING 走 MotionEasing / 引用别的变量用 `{type:'VARIABLE_ALIAS', id}`。
         */
        value: z.unknown().optional(),
      }),
    )
    .min(1),
});

/**
 * 节点级可绑字段(`setBoundVariable` 的 `field`),逐值抄自
 * `@figma/plugin-typings` `plugin-api.d.ts:6817-6852` 的
 * `VariableBindableNodeField` + `VariableBindableTextField`。
 * 表外一律点名拒,不丢给引擎抛一句没有上下文的错。
 */
const NODE_BOUND_FIELDS = [
  'width',
  'height',
  'characters',
  'itemSpacing',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
  'visible',
  'cornerRadius',
  'topLeftRadius',
  'topRightRadius',
  'bottomLeftRadius',
  'bottomRightRadius',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'counterAxisSpacing',
  'strokeWeight',
  'strokeTopWeight',
  'strokeRightWeight',
  'strokeBottomWeight',
  'strokeLeftWeight',
  'opacity',
  'gridRowGap',
  'gridColumnGap',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'paragraphSpacing',
  'paragraphIndent',
] as const;

/** 数组型字段:绑到数组**某一项的子字段**,与节点级字段是两套入口 */
const ITEM_BOUND_FIELDS = {
  effects: ['color', 'radius', 'spread', 'offsetX', 'offsetY'],
  layoutGrids: ['sectionSize', 'count', 'offset', 'gutterSize'],
} as const;

/** 填充/描边:变量必须绑在 paint 自身,节点级 setBoundVariable 会抛
 * 「fills and strokes variable bindings must be set on paints directly」;子字段固定 `color` */
const PAINT_BOUND_FIELDS = ['fills', 'strokes'] as const;

const bindingSchema = z
  .object({
    nodeIds: z.array(z.string()).min(1),
    boundProperty: z
      .string()
      .describe(
        '引擎字段名:节点级(见工具描述的名单)/ fills / strokes / effects / layoutGrids',
      ),
    subField: z
      .string()
      .optional()
      .describe('effects / layoutGrids 必填(color / radius / …)'),
    index: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        '数组项下标;effects / layoutGrids 必填,fills / strokes 可省略(= 全部 SOLID 项)',
      ),
    variableId: z
      .string()
      .optional()
      .describe('要绑的变量 id;`unbind: true` 时不用给'),
    unbind: z
      .boolean()
      .optional()
      .describe('true = 解绑该字段上的变量绑定;默认 false(绑定)'),
  })
  // 逐组也 strict:整份参数里拼错的键必须当场被点名,不能被静默丢掉后
  // 让人以为「绑过了」(真机 2026-10-14 就在 MG 侧误塞过 `boundProperty:""`)
  .strict()
  .superRefine((v, ctx) => {
    if (v.unbind !== true && v.variableId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variableId'],
        message: '绑定时必须给 variableId(解绑才不用给)',
      });
    }
    if (v.boundProperty in ITEM_BOUND_FIELDS) {
      const allowed: readonly string[] =
        ITEM_BOUND_FIELDS[v.boundProperty as keyof typeof ITEM_BOUND_FIELDS];
      if (v.index == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['index'],
          message: `${v.boundProperty} 是数组项,必须给 index`,
        });
      }
      if (v.subField == null || !allowed.includes(v.subField)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['subField'],
          message: `${v.boundProperty} 的可绑子字段是:${allowed.join(' / ')}`,
        });
      }
    }
  });

const variablesApplySchema = z.object({
  bindings: z
    .array(bindingSchema)
    .min(1)
    .describe('一组 = 一个变量 × 一个字段 × 一批节点;一次调用可带多组'),
});

const variablesRemoveSchema = z.object({
  variableIds: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      '要删的变量 id 列表(取自 figma_variables_list 或 assets.variables)',
    ),
});

/**
 * 删变量:引擎的 `Variable.remove()` 是同步的(typings :11774)。
 * 逐条删,单条找不到不连坐其余 —— 回包点名。
 */
async function removeVariables(
  _host: DesignHost,
  params: unknown,
): Promise<{ removed: string[]; failed: { id: string; reason: string }[] }> {
  const { variableIds } = params as { variableIds: string[] };
  const removed: string[] = [];
  const failed: { id: string; reason: string }[] = [];
  for (const id of variableIds) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(id);
      if (variable == null) throw new Error(`没有找到变量: ${id}`);
      variable.remove();
      removed.push(id);
    } catch (e) {
      failed.push({ id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { removed, failed };
}

/**
 * 变量清单(与 MG 的 `mg_list_variables` **同形**,两边共用一套调用纪律)。
 *
 * 为什么需要它:Figma 的变量读路径此前只有节点上的 `boundVariables` —— 读到的是**绑定**,
 * 不是**库存**;「有哪些变量、值是多少、有哪些模式」在画布上没有出口,选变量绑定前只能靠猜 id。
 * 与 `jsd_get_page` 的 `assets.variables` 不是两件事:那条是不分平台的概览(只有 id + 名称)。
 */
const variablesListSchema = z.object({
  collectionId: z.string().optional().describe('只列该集合下的变量'),
  type: z
    .enum(['BOOLEAN', 'COLOR', 'EASING', 'FLOAT', 'STRING', 'TIMING'])
    .optional()
    .describe('只列该类型的变量(全表 6 种,与 figma_variables_create 同宽)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe('最多返回几个变量(默认 200);集合那一段恒全量返回'),
});

/**
 * `type` 收全五种是为了给 `VARIANT` / `SLOT` 一句
 * 点名原因 —— 只在 schema 层用 enum 拒掉的话,调用方看到的是通用「Invalid enum value」。
 */
const componentPropertyAddSchema = z.object({
  componentId: z.string(),
  name: z.string(),
  type: z.enum(['BOOLEAN', 'TEXT', 'INSTANCE_SWAP', 'VARIANT', 'SLOT']),
  /** BOOLEAN 用布尔;TEXT 用字符串;INSTANCE_SWAP 用默认组件的节点 id */
  defaultValue: z.union([z.boolean(), z.string()]),
  /** 仅 INSTANCE_SWAP:换绑候选(引擎要求 component key) */
  preferredValues: z
    .array(
      z.object({
        type: z.enum(['COMPONENT', 'COMPONENT_SET']),
        key: z.string(),
      }),
    )
    .optional(),
  /** 给了就连带绑定:属性才会真的驱动该子层(引用键由 type 推导,不单独传槽位) */
  sublayerId: z.string().optional(),
});

const styleApplyByNameSchema = z.object({
  nodeIds: z.array(z.string()).min(1),
  kind: z.enum(['fill', 'stroke', 'text', 'effect']),
  styleName: z.string(),
});

const styleVariablesListSchema = z.object({
  styleId: z
    .string()
    .optional()
    .describe(
      '点名一条样式(团队库样式也能解析,值面只读);不给就按 kind 列本地样式',
    ),
  kind: z
    .enum(['PAINT', 'TEXT', 'EFFECT', 'GRID'])
    .optional()
    .describe('只看某一类;省略 = 四类都列'),
  limit: z.number().int().min(1).optional().describe('默认 200'),
});

const styleBindingSchema = z
  .object({
    styleIds: z
      .array(z.string())
      .min(1)
      .describe('一组 = 一个变量 × 一个字段 × 一批样式'),
    boundProperty: z
      .string()
      .describe(
        '样式档的引擎字段名:排版档 fontFamily / fontSize / fontStyle / fontWeight / letterSpacing / lineHeight / paragraphSpacing / paragraphIndent(仅 TEXT 样式),或数组档 paints / effects / layoutGrids',
      ),
    subField: z
      .string()
      .optional()
      .describe(
        '数组档必填:paints→color;effects→color/radius/spread/offsetX/offsetY;layoutGrids→sectionSize/count/offset/gutterSize',
      ),
    index: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        '数组项下标;effects / layoutGrids 必填,paints 省略即该数组全部 SOLID 项',
      ),
    variableId: z
      .string()
      .optional()
      .describe('要绑的变量 id;`unbind: true` 时不用给'),
    unbind: z
      .boolean()
      .optional()
      .describe('true = 摘掉该字段上的绑定(不需要 variableId)'),
  })
  .strict();

const styleVariablesApplySchema = z.object({
  bindings: z.array(styleBindingSchema).min(1),
});

const componentPropertiesSetSchema = z.object({
  nodeIds: z.array(z.string()).min(1),
  properties: z.record(
    z.string(),
    z.object({
      type: z.enum(['BOOLEAN', 'TEXT', 'VARIANT', 'INSTANCE_SWAP']),
      /**
       * 标量 = 写死值;`{type:'VARIABLE_ALIAS', id}` = 让该属性跟随变量
       * (引擎写侧签名收 VariableAlias,`plugin-api.d.ts:11123`;
       * 别名由 `figma_variables_list` / `jsd_get_page` 的 assets.variables 拿 id)
       */
      value: z.union([
        z.boolean(),
        z.string(),
        z.object({ type: z.literal('VARIABLE_ALIAS'), id: z.string() }),
      ]),
    }),
  ),
});

type StyleableNode = {
  id: string;
  fillStyleId?: string;
  strokeStyleId?: string;
  textStyleId?: string;
  effectStyleId?: string;
  setFillStyleIdAsync?(id: string): Promise<void>;
  setStrokeStyleIdAsync?(id: string): Promise<void>;
  setTextStyleIdAsync?(id: string): Promise<void>;
  setEffectStyleIdAsync?(id: string): Promise<void>;
};

/** op 的 `kind` → 该绑到节点的哪个字段与哪个异步入口(两类入口成对登记,不靠拼字符串) */
const STYLE_BIND_TARGET = {
  fill: { field: 'fillStyleId', setter: 'setFillStyleIdAsync' },
  stroke: { field: 'strokeStyleId', setter: 'setStrokeStyleIdAsync' },
  text: { field: 'textStyleId', setter: 'setTextStyleIdAsync' },
  effect: { field: 'effectStyleId', setter: 'setEffectStyleIdAsync' },
} as const satisfies Record<
  'fill' | 'stroke' | 'text' | 'effect',
  { field: keyof StyleableNode; setter: keyof StyleableNode }
>;

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
      type: 'BOOLEAN' | 'COLOR' | 'EASING' | 'FLOAT' | 'STRING' | 'TIMING';
      /** COLOR 用 {r,g,b} 或 {r,g,b,a}(0-1 浮点,非 hex 字符串);FLOAT/TIMING 用 number;引用别的变量用 {type:'VARIABLE_ALIAS', id} */
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

/** 表外字段的点名原因:常见误写不是「拼错」,是拿别的平台的词汇或别的路径来绑 */
function rejectionReason(field: string): string | null {
  if (NODE_BOUND_FIELDS.includes(field as (typeof NODE_BOUND_FIELDS)[number]))
    return null;
  if ((PAINT_BOUND_FIELDS as readonly string[]).includes(field)) return null;
  if (field in ITEM_BOUND_FIELDS) return null;
  if (field === 'backgrounds')
    return 'Figma 节点没有 backgrounds 字段(frame 的填充就叫 fills);backgrounds 是即时设计的词汇';
  if (field === 'variantProperties')
    return '变体属性不在 setBoundVariable 的可绑字段里(VariableBindableNodeField,plugin-api.d.ts:6817-6844),变量类型表里也没有 VARIANT(同文件 :11571);切变体取值用 jsd_set_instance_properties';
  if (field === 'componentProperties')
    return '组件属性值绑变量走 figma_component_properties_set:properties 的值传 {type, value:{type:"VARIABLE_ALIAS", id}}';
  return `不是引擎可绑字段。节点级可绑:${NODE_BOUND_FIELDS.join(' / ')};数组型:fills / strokes(子字段固定 color)、effects / layoutGrids(要给 subField + index)`;
}

interface FigmaBinding {
  nodeIds: string[];
  boundProperty: string;
  subField?: string;
  index?: number;
  variableId?: string;
  unbind?: boolean;
}

interface BindGroupResult {
  boundProperty: string;
  variableId?: string;
  applied: string[];
  failed: string[];
}

/** 把一组 binding 落到一批节点上;返回逐节点成败(id 清单),不静默跳过 */
async function runBinding(
  host: DesignHost,
  b: FigmaBinding,
  label: string,
): Promise<BindGroupResult> {
  const reject = rejectionReason(b.boundProperty);
  if (reject != null) {
    throw new Error(`${label} boundProperty=${b.boundProperty}:${reject}`);
  }
  const unbind = b.unbind === true;
  // 解绑不需要变量:两个入口都收 null,语义是「把该字段上绑着的东西摘掉」
  const variable = unbind
    ? null
    : await figma.variables.getVariableByIdAsync(b.variableId ?? '');
  if (!unbind && variable == null) {
    throw new Error(
      `${label} 没有找到变量: ${b.variableId ?? '(未给 variableId)'}`,
    );
  }
  const nodes = await resolveNodes(host, b.nodeIds);
  if (nodes.length === 0) throw new Error(`${label} 没有找到节点`);
  const applied: string[] = [];
  const failed: string[] = [];
  const isPaint = (PAINT_BOUND_FIELDS as readonly string[]).includes(
    b.boundProperty,
  );
  const isItem = b.boundProperty in ITEM_BOUND_FIELDS;
  for (const n of nodes) {
    const target = n as unknown as Record<string, unknown>;
    try {
      if (isPaint || isItem) {
        const items = target[b.boundProperty];
        if (!Array.isArray(items) || items.length === 0) {
          failed.push(n.id);
          continue;
        }
        const indices =
          b.index == null
            ? items.map((_, i) => i)
            : b.index < items.length
              ? [b.index]
              : null;
        if (indices == null) {
          failed.push(n.id);
          continue;
        }
        // 数组项的可绑字段随项类型而定:填/描边只有 SOLID 端能绑 color,
        // effects / layoutGrids 按调用方给的 subField 绑那一项(引擎返回副本,须整体写回)
        const next = [...items] as unknown[];
        let touched = 0;
        for (const i of indices) {
          const item = items[i] as { type?: string };
          if (isPaint && item?.type !== 'SOLID') continue;
          next[i] = isPaint
            ? figma.variables.setBoundVariableForPaint(
                items[i] as SolidPaint,
                'color',
                variable,
              )
            : b.boundProperty === 'effects'
              ? figma.variables.setBoundVariableForEffect(
                  items[i] as Effect,
                  b.subField as VariableBindableEffectField,
                  variable,
                )
              : figma.variables.setBoundVariableForLayoutGrid(
                  items[i] as LayoutGrid,
                  b.subField as VariableBindableLayoutGridField,
                  variable,
                );
          touched++;
        }
        if (touched === 0) {
          failed.push(n.id);
          continue;
        }
        target[b.boundProperty] = next;
        applied.push(n.id);
        continue;
      }
      (
        n as unknown as {
          setBoundVariable(property: string, variable: Variable | null): void;
        }
      ).setBoundVariable(b.boundProperty, variable);
      applied.push(n.id);
    } catch {
      failed.push(n.id);
    }
  }
  return {
    boundProperty: b.boundProperty,
    ...(b.variableId != null ? { variableId: b.variableId } : {}),
    applied,
    failed,
  };
}

async function applyVariables(
  host: DesignHost,
  params: unknown,
): Promise<{
  groups: BindGroupResult[];
  applied: string[];
  failed: string[];
}> {
  const { bindings } = params as { bindings: FigmaBinding[] };
  const groups: BindGroupResult[] = [];
  for (const [i, b] of bindings.entries()) {
    groups.push(await runBinding(host, b, `bindings[${i}]`));
  }
  // 汇总面:同一个节点可能在多组里,先去重再报总数
  const applied = [...new Set(groups.flatMap((g) => g.applied))];
  const failed = [...new Set(groups.flatMap((g) => g.failed))].filter(
    (id) => !applied.includes(id),
  );
  return { groups, applied, failed };
}

async function listVariables(
  _host: DesignHost,
  params: unknown,
): Promise<{
  collections: Array<{
    id: string;
    name: string;
    defaultModeId: string;
    modes: Array<{ id: string; name: string }>;
  }>;
  variables: Array<{
    id: string;
    name: string;
    type: string;
    collectionId: string;
    description?: string;
    /** 各模式下的值(键 = modeId),原样透传不归一 */
    values: Record<string, unknown>;
  }>;
  count: number;
  truncated?: boolean;
}> {
  const p = params as {
    collectionId?: string;
    type?: 'BOOLEAN' | 'COLOR' | 'EASING' | 'FLOAT' | 'STRING' | 'TIMING';
    limit?: number;
  };
  const limit = p.limit ?? 200;
  // dynamic-page 下 variables 的同步 getter 全部抛异常,一律走 *Async(0011)
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const all = await figma.variables.getLocalVariablesAsync(p.type);
  const filtered =
    p.collectionId == null
      ? all
      : all.filter((v) => v.variableCollectionId === p.collectionId);
  const slice = filtered.slice(0, limit);
  return {
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      defaultModeId: c.defaultModeId,
      modes: c.modes.map((m) => ({ id: m.modeId, name: m.name })),
    })),
    variables: slice.map((v) => ({
      id: v.id,
      name: v.name,
      type: v.resolvedType,
      collectionId: v.variableCollectionId,
      ...(v.description ? { description: v.description } : {}),
      values: v.valuesByMode as unknown as Record<string, unknown>,
    })),
    count: filtered.length,
    ...(filtered.length > slice.length ? { truncated: true } : {}),
  };
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
): Promise<{ applied: string[]; failed?: string[] }> {
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
  if (!styleId) {
    // 报错必须自带可执行出口:点名本文件该类样式的现有清单;一条都没有时明说"没有",
    // 否则调用方只能反复猜名字(清单就在手边,零成本带出)
    const names = localStyles.map((s) => s.name);
    const kindLabel =
      p.kind === 'fill' || p.kind === 'stroke'
        ? '绘制(PAINT)'
        : p.kind === 'text'
          ? '文本(TEXT)'
          : '效果(EFFECT)';
    throw new Error(
      names.length === 0
        ? `本文件当前没有任何本地样式(${kindLabel} 类),无法按名应用;可读 jsd://styles 复核`
        : `未找到本地样式: ${p.styleName}。本文件 ${kindLabel} 类现有样式: ${names.join('、')}`,
    );
  }
  const nodes = await resolveNodes(host, p.nodeIds);
  if (nodes.length === 0) throw new Error('没有找到要应用样式的节点');
  const styleable = nodes as unknown as StyleableNode[];
  const { field, setter } = STYLE_BIND_TARGET[p.kind];
  const applied: string[] = [];
  const failed: string[] = [];
  for (const n of styleable) {
    try {
      // dynamic-page 下同步赋值 `fillStyleId` 会抛(与 core/props/types.ts 的
      // writeStyleRefProp 同一个理由):有异步入口就用它,没有才退到赋值
      const fn = n[setter];
      if (typeof fn === 'function') await fn.call(n, styleId);
      else (n as unknown as Record<string, unknown>)[field] = styleId;
      applied.push(n.id);
    } catch {
      // 该节点类型没有这个样式面(frame 上没有 textStyleId):点名而非静默跳过
      failed.push(n.id);
    }
  }
  return { applied, ...(failed.length > 0 ? { failed } : {}) };
}

/**
 * 样式对象上的**数组型**可绑字段 → 该档的子字段表。
 *
 * ⚠ 词汇与节点档**不同源**:节点上填充/描边叫 `fills` / `strokes`,样式上那一份叫
 * `paints`(`VariableBindablePaintStyleField = 'paints'`,typings :6855)。把
 * `figma_variables_apply` 的名字照抄过来会打在不存在的面上传,故点名拒。
 */
const STYLE_ITEM_BOUND_FIELDS = {
  paints: ['color'],
  effects: ['color', 'radius', 'spread', 'offsetX', 'offsetY'],
  layoutGrids: ['sectionSize', 'count', 'offset', 'gutterSize'],
} as const;

/**
 * 样式上的**排版档**可绑字段 = `VariableBindableTextField`(typings :6845-6853)。
 * 只有 `TextStyle` 有 `setBoundVariable`(:12507);另三类靠 `boundVariables` 只读回显
 * + 整数组赋回(`paints` / `effects` / `layoutGrids` 三个属性本身可写)。
 */
const STYLE_TEXT_BOUND_FIELDS = [
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'paragraphSpacing',
  'paragraphIndent',
] as const;

/** 一条样式回包:摘要 + 它自己的值 + 它内部的变量绑定(全量面只读,不改) */
interface StyleDetailRow {
  id: string;
  name: string;
  type: string;
  description?: string;
  /** 该样式抄出来的值(键 = paints / effects / layoutGrids / 排版那几项),原样透传 */
  values: Record<string, unknown>;
  /**
   * 样式内部的变量绑定,键是**样式档**的字段名(`paints` / `effects` / `layoutGrids` /
   * 排版字段),值形态由引擎给(PAINT/EFFECT/GRID 是数组、TEXT 是单个别名)。
   */
  boundVariables?: Record<string, unknown>;
}

/** 逐类异步 getter(0011:dynamic-page 下同步 getter 全抛);kind 省略 = 四类都问 */
async function stylesByKind(
  kind: 'PAINT' | 'TEXT' | 'EFFECT' | 'GRID' | undefined,
): Promise<BaseStyle[]> {
  if (kind === 'PAINT')
    return (await figma.getLocalPaintStylesAsync()) as BaseStyle[];
  if (kind === 'TEXT')
    return (await figma.getLocalTextStylesAsync()) as BaseStyle[];
  if (kind === 'EFFECT')
    return (await figma.getLocalEffectStylesAsync()) as BaseStyle[];
  if (kind === 'GRID')
    return (await figma.getLocalGridStylesAsync()) as BaseStyle[];
  const [p, t, e, g] = await Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync(),
  ]);
  return [...p, ...t, ...e, ...g] as unknown as BaseStyle[];
}

/** 样式的值面:按类别取「这组固定视觉到底是什么」,排版档只带属于样式的那几项 */
function styleValuesOf(style: BaseStyle): Record<string, unknown> {
  const s = style as unknown as Record<string, unknown>;
  if (style.type === 'PAINT') return { paints: s.paints };
  if (style.type === 'EFFECT') return { effects: s.effects };
  if (style.type === 'GRID') return { layoutGrids: s.layoutGrids };
  const out: Record<string, unknown> = {};
  for (const field of [
    'fontName',
    'fontSize',
    'fontStyle',
    'fontWeight',
    'letterSpacing',
    'lineHeight',
    'paragraphSpacing',
    'paragraphIndent',
    'textCase',
    'textDecoration',
  ]) {
    const v = s[field];
    if (v !== undefined) out[field] = v;
  }
  return out;
}

function toStyleRow(style: BaseStyle): StyleDetailRow {
  const bound = (
    style as unknown as { boundVariables?: Record<string, unknown> }
  ).boundVariables;
  const description = (style as unknown as { description?: string })
    .description;
  return {
    id: style.id,
    name: style.name,
    type: style.type,
    ...(description ? { description } : {}),
    values: styleValuesOf(style),
    ...(bound && Object.keys(bound).length > 0
      ? { boundVariables: bound }
      : {}),
  };
}

/**
 * 样式 ↔ 变量的**读出口**:回答「这条样式里哪个字段跟着变量走」。
 * 存在理由:`assets.styles` 只有 id + 名称,节点上的 `boundVariables` 又**不含**样式内部
 * 的绑定 —— 这条链(变量 → 样式 → 节点)此前在画布上没有出口,绑完无从验证。
 */
async function listStyleVariables(
  _host: DesignHost,
  params: unknown,
): Promise<{
  styles: StyleDetailRow[];
  count: number;
  truncated?: boolean;
}> {
  const p = params as {
    styleId?: string;
    kind?: 'PAINT' | 'TEXT' | 'EFFECT' | 'GRID';
    limit?: number;
  };
  const limit = p.limit ?? 200;
  if (p.styleId != null) {
    // 按 id 点名:团队库样式也在 getStyleByIdAsync 的解析范围内,但它的值面是只读的
    const found = await figma.getStyleByIdAsync(p.styleId);
    if (found == null) throw new Error(`没有找到样式: ${p.styleId}`);
    return { styles: [toStyleRow(found)], count: 1 };
  }
  const all = await stylesByKind(p.kind);
  const slice = all.slice(0, limit);
  return {
    styles: slice.map(toStyleRow),
    count: all.length,
    ...(all.length > slice.length ? { truncated: true } : {}),
  };
}

interface StyleBinding {
  styleIds: string[];
  boundProperty: string;
  subField?: string;
  index?: number;
  variableId?: string;
  unbind?: boolean;
}

interface StyleBindGroupResult {
  boundProperty: string;
  variableId?: string;
  applied: string[];
  failed: string[];
  /** 写完立刻从样式对象读回的绑定(每组各条样式的当前状态) */
  styles: StyleDetailRow[];
}

/** 表外的 boundProperty 点名:多数误写是拿**节点档**的词汇来绑样式 */
function styleRejectionReason(field: string): string | null {
  if ((STYLE_TEXT_BOUND_FIELDS as readonly string[]).includes(field))
    return null;
  if (field in STYLE_ITEM_BOUND_FIELDS) return null;
  if (field === 'fills' || field === 'strokes')
    return `节点档才叫 ${field};样式上那一份叫 paints(PAINT 类的可绑字段只有 paints,子字段固定 color)`;
  if (field === 'color')
    return 'color 是 paints 的**子字段**,不是样式档的字段名:boundProperty 传 paints、subField 传 color';
  if (field === 'backgrounds')
    return 'backgrounds 是即时设计的词汇,Figma 的样式与节点都没有它';
  return `样式上只有两档可绑:排版档(${STYLE_TEXT_BOUND_FIELDS.join(' / ')};仅 TEXT 样式)与数组档(${Object.keys(STYLE_ITEM_BOUND_FIELDS).join(' / ')};各要 subField,effects / layoutGrids 还要 index)。节点字段(width / cornerRadius / opacity …)不能绑到样式上`;
}

/**
 * 把一组绑定落到一批样式上,并**回读**当前绑定 —— 「变量 → 样式」这条链没有别的证据源,
 * 引擎的 `boundVariables` 是只读面(0024 同口径:写后回读比的就是同一个 variableId)。
 */
async function runStyleBinding(
  b: StyleBinding,
  label: string,
): Promise<StyleBindGroupResult> {
  const reject = styleRejectionReason(b.boundProperty);
  if (reject != null)
    throw new Error(`${label} boundProperty=${b.boundProperty}:${reject}`);
  const unbind = b.unbind === true;
  const variable = unbind
    ? null
    : await figma.variables.getVariableByIdAsync(b.variableId ?? '');
  if (!unbind && variable == null) {
    throw new Error(
      `${label} 没有找到变量: ${b.variableId ?? '(未给 variableId)'}`,
    );
  }
  if (b.styleIds.length === 0) throw new Error(`${label} 没有给 styleIds`);
  const isItem = b.boundProperty in STYLE_ITEM_BOUND_FIELDS;
  const applied: string[] = [];
  const failed: string[] = [];
  const rows: StyleDetailRow[] = [];
  for (const styleId of b.styleIds) {
    const style = await figma.getStyleByIdAsync(styleId);
    if (style == null) {
      failed.push(styleId);
      continue;
    }
    try {
      if (isItem) {
        const target = style as unknown as Record<string, unknown>;
        const items = target[b.boundProperty];
        if (!Array.isArray(items) || items.length === 0) {
          failed.push(styleId);
          continue;
        }
        const allowed = STYLE_ITEM_BOUND_FIELDS[
          b.boundProperty as keyof typeof STYLE_ITEM_BOUND_FIELDS
        ] as readonly string[];
        if (b.subField == null || !allowed.includes(b.subField)) {
          throw new Error(
            `${label} ${b.boundProperty} 要 subField:${allowed.join(' / ')}`,
          );
        }
        // paints 省略 index = 全部 SOLID 项(与节点档同一取舍);effects / layoutGrids 必须给
        const needIndex = b.boundProperty !== 'paints';
        if (b.index == null && needIndex) {
          throw new Error(
            `${label} ${b.boundProperty} 必须给 index(数组项逐条绑)`,
          );
        }
        const indices =
          b.index == null
            ? items.map((_, i) => i)
            : b.index < items.length
              ? [b.index]
              : null;
        if (indices == null) {
          failed.push(styleId);
          continue;
        }
        const next = [...items] as unknown[];
        let touched = 0;
        for (const i of indices) {
          const item = items[i] as { type?: string };
          if (b.boundProperty === 'paints' && item?.type !== 'SOLID') continue;
          next[i] =
            b.boundProperty === 'paints'
              ? figma.variables.setBoundVariableForPaint(
                  items[i] as SolidPaint,
                  b.subField as VariableBindablePaintField,
                  variable,
                )
              : b.boundProperty === 'effects'
                ? figma.variables.setBoundVariableForEffect(
                    items[i] as Effect,
                    b.subField as VariableBindableEffectField,
                    variable,
                  )
                : figma.variables.setBoundVariableForLayoutGrid(
                    items[i] as LayoutGrid,
                    b.subField as VariableBindableLayoutGridField,
                    variable,
                  );
          touched++;
        }
        if (touched === 0) {
          failed.push(styleId);
          continue;
        }
        // 三个入口都返回**副本**,必须整数组赋回才落到样式上
        target[b.boundProperty] = next;
        applied.push(styleId);
        rows.push(
          toStyleRow((await figma.getStyleByIdAsync(styleId)) ?? style),
        );
        continue;
      }
      // 排版档:只有 TextStyle 有 setBoundVariable(:12507)
      if (style.type !== 'TEXT') {
        throw new Error(
          `${label} ${b.boundProperty} 是排版档,只有 TEXT 样式能绑(这条是 ${style.type})`,
        );
      }
      style.setBoundVariable(
        b.boundProperty as VariableBindableTextField,
        variable,
      );
      applied.push(styleId);
      rows.push(toStyleRow((await figma.getStyleByIdAsync(styleId)) ?? style));
    } catch (e) {
      // 引擎拒收(类型不匹配 / 该面只读):点名到具体样式,不静默跳过
      failed.push(`${styleId}(${e instanceof Error ? e.message : String(e)})`);
    }
  }
  return {
    boundProperty: b.boundProperty,
    ...(b.variableId != null ? { variableId: b.variableId } : {}),
    applied,
    failed,
    styles: rows,
  };
}

async function applyStyleVariables(
  _host: DesignHost,
  params: unknown,
): Promise<{
  groups: StyleBindGroupResult[];
  applied: string[];
  failed: string[];
}> {
  const { bindings } = params as { bindings: StyleBinding[] };
  if (bindings == null || bindings.length === 0)
    throw new Error('变量绑定列表为空');
  const groups: StyleBindGroupResult[] = [];
  for (const [i, b] of bindings.entries()) {
    groups.push(await runStyleBinding(b, `bindings[${i}]`));
  }
  const applied = [...new Set(groups.flatMap((g) => g.applied))];
  const failed = [...new Set(groups.flatMap((g) => g.failed))];
  return { groups, applied, failed };
}

async function setComponentProperties(
  host: DesignHost,
  params: unknown,
): Promise<{ updated: string[] }> {
  const p = params as {
    nodeIds: string[];
    properties: Record<
      string,
      {
        type: string;
        value: boolean | string | { type: 'VARIABLE_ALIAS'; id: string };
      }
    >;
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
    // 值一律先归一到**写形态**(引擎只收标量,`{type,value}` 是读形态 —— 见 0023)
    const { writes, skipped } = toComponentPropertyWrites(p.properties);
    if (skipped.length > 0) {
      throw new Error(
        `属性 ${skipped.join('、')} 无法写成标量(SLOT 不收或缺 value),未向引擎发起请求。`,
      );
    }
    inst.setProperties(writes);
  }
  return { updated: nodes.map((n) => n.id) };
}

/**
 * 属性类型 → 绑定槽。**推导而非入参**:Figma 引擎键是 `visible`,而 MG 的 wire 词汇
 * 是 `isVisible` —— 做成参数就得在调用方暴露两套词汇(0025;与 0023「一份形态知识
 * 只写一处」同源)。
 */
type BindablePropertyType = 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP';
const BIND_SLOT_BY_TYPE: Record<
  BindablePropertyType,
  'visible' | 'characters' | 'mainComponent'
> = {
  BOOLEAN: 'visible',
  TEXT: 'characters',
  INSTANCE_SWAP: 'mainComponent',
};

type ComponentPropertyReferences = {
  visible?: string;
  characters?: string;
  mainComponent?: string;
};

/**
 * 定义一个组件属性;给了 `sublayerId` 就连带把它绑到该子层(0025)。
 *
 * 绑定与定义合并在一次调用里,是为了消掉「属性定义了但没绑、驱动不了任何东西」的
 * 中间态(0007)。`addComponentProperty` 返回**带唯一后缀**的属性名(如 `Icon#0:0`),
 * 那个名字才是 `setProperties` / `figma_component_properties_set` 要用的键,故原样回传。
 */
async function addComponentProperty(
  host: DesignHost,
  params: unknown,
): Promise<{
  componentId: string;
  propertyName: string;
  boundSublayerId?: string;
}> {
  const p = params as {
    componentId: string;
    name: string;
    type: BindablePropertyType | 'VARIANT' | 'SLOT';
    defaultValue: boolean | string;
    preferredValues?: { type: 'COMPONENT' | 'COMPONENT_SET'; key: string }[];
    sublayerId?: string;
  };
  if (p.type === 'VARIANT' || p.type === 'SLOT') {
    throw new Error(
      p.type === 'VARIANT'
        ? 'VARIANT 属性由变体集的变体名派生,不能用本 op 定义;要建变体请用 jsd_combine_as_variants'
        : 'SLOT 不在引擎可绑的三个槽(visible/characters/mainComponent)里 —— 建了也驱动不了任何子层,本 op 不提供',
    );
  }
  // dynamic-page 下同步 getNodeById 会抛,一律走 Access 层(0011)
  const [found] = await resolveNodes(host, [p.componentId]);
  if (found == null) throw new Error(`没有找到组件: ${p.componentId}`);
  if (found.type !== 'COMPONENT') {
    throw new Error(
      `只作用于 COMPONENT(收到 ${found.type});实例请改其主组件,变体集请改其中的 COMPONENT`,
    );
  }
  const component = found as unknown as {
    addComponentProperty(
      propertyName: string,
      type: string,
      defaultValue: string | boolean,
      options?: { preferredValues?: { type: string; key: string }[] },
    ): string;
  };
  const propertyName = component.addComponentProperty(
    p.name,
    p.type,
    p.defaultValue,
    p.preferredValues != null
      ? { preferredValues: p.preferredValues }
      : undefined,
  );
  if (p.sublayerId == null) {
    return { componentId: p.componentId, propertyName };
  }
  const slot = BIND_SLOT_BY_TYPE[p.type];
  const [foundSublayer] = await resolveNodes(host, [p.sublayerId]);
  if (foundSublayer == null)
    throw new Error(`没有找到要绑定的子层: ${p.sublayerId}`);
  const sublayer = foundSublayer as unknown as {
    componentPropertyReferences: ComponentPropertyReferences | null;
  };
  sublayer.componentPropertyReferences = {
    ...(sublayer.componentPropertyReferences ?? {}),
    [slot]: propertyName,
  };
  // 回读校验:回显成功 ≠ 真绑上(0007)。只读子层的 references,不读
  // componentPropertyDefinitions —— 后者在 dynamic-page 下的同步读取有受限风险。
  const after = sublayer.componentPropertyReferences?.[slot];
  if (after !== propertyName) {
    throw new Error(
      `属性已建(${propertyName}),但绑定未生效:${p.sublayerId} 的 ${slot} 回读得到 ${after ?? '空'}`,
    );
  }
  return {
    componentId: p.componentId,
    propertyName,
    boundSublayerId: p.sublayerId,
  };
}

export const figmaOps: PlatformOp[] = [
  {
    name: 'figma_variables_create',
    title: '创建变量',
    description:
      "Figma 特有:批量创建变量(失败整体回滚)。params: { collectionName?, variables: [{name, type: BOOLEAN|COLOR|EASING|FLOAT|STRING|TIMING, value?}] } —— type 就是 `VariableResolvedDataType` 全表(:11571),`createVariable` 只收这六种。value 按 `VariableValue`(:11588)的形状:COLOR 用 {r,g,b} 或 {r,g,b,a}(0-1 浮点,非 hex);FLOAT / TIMING 用 number;BOOLEAN 用 boolean;STRING 用 string;EASING 走 MotionEasing;要**引用另一个变量**(那是值形态 `VARIABLE_ALIAS`,不是可建类型)传 {type:'VARIABLE_ALIAS', id}",
    inputSchema: variablesCreateSchema,
    run: createVariables,
  },
  {
    name: 'figma_variables_list',
    title: '查看变量集合与变量',
    description:
      'Figma 特有:列出**变量集合(含模式)**与**变量**(类型 / 所属集合 / 描述 / 各模式的值)。params: { collectionId?, type?: BOOLEAN|COLOR|EASING|FLOAT|STRING|TIMING, limit? }。**动手前的摸底入口**,也是另两个变量 op 的回读面;与 MG 的 `mg_list_variables` 同形。绑定前先在这里拿 `variableId`(与 `jsd_get_page` 的 `assets.variables` 不是两件事:那条是不分平台的概览,只有 id + 名称)',
    inputSchema: variablesListSchema,
    run: listVariables,
  },
  {
    name: 'figma_variables_apply',
    title: '批量绑定/解绑变量',
    description:
      'Figma 特有:一次调用绑**多组**变量,`unbind: true` 则解绑(解绑**不用**给 variableId)。params: { bindings: [{ nodeIds, boundProperty, variableId?, subField?, index?, unbind? }] } —— 一组 = 一个变量 × 一个字段 × 一批节点。boundProperty 用引擎词汇,三档入口不同:① 节点级(width/height/characters/itemSpacing/padding*/corner*/四角 radius/minmax*/stroke*Weight/opacity/gridRowGap/gridColumnGap/visible/fontFamily/fontSize/fontStyle/fontWeight/letterSpacing/lineHeight/paragraphSpacing/paragraphIndent)走 setBoundVariable;② fills / strokes 绑在 paint 自身(节点级会抛),子字段固定 color,index 省略 = 该数组**全部 SOLID 项**,渐变等其余 paint 原样保留;③ effects / layoutGrids 绑数组项,**必须**给 index + subField(effects:color/radius/spread/offsetX/offsetY;layoutGrids:sectionSize/count/offset/gutterSize)。表外字段当场点名拒:backgrounds 是即时设计词汇、variantProperties 不可绑(切变体用 jsd_set_instance_properties)、componentProperties 改走 figma_component_properties_set 的别名值。回包 groups 逐组给 applied/failed,failed = 该节点上这个字段不存在 / 非 SOLID / 引擎拒。⚠ 本 op 只吃**节点**:样式对象自己的变量绑定(`PaintStyle` / `TextStyle` / `EffectStyle` / `GridStyle` 的 `boundVariables`,typings :12432 / :12496 / :12521 / :12537)是另一档词汇,走 `figma_style_variables_apply` 绑、`figma_style_variables_list` 回读 —— 两边字段名不同(节点上叫 fills/strokes,样式上叫 paints),别混着传。⚠ 可绑的变量类型 = `VariableResolvedDataType` 六种(BOOLEAN / COLOR / EASING / FLOAT / STRING / TIMING,typings :11571),**没有 VARIANT 类型变量** —— 变体属性也不在可绑字段表里(:6817-6844)',
    inputSchema: variablesApplySchema,
    run: applyVariables,
  },
  {
    name: 'figma_variables_remove',
    title: '删除变量',
    description:
      'Figma 特有:删本地变量(逐个删,单条 id 不存在只进 failed、不连坐其余)。params: { variableIds: [id…] }。与 `jsd_delete_style` 成对:接上删除之后,`figma_variables_create` / `jsd_create_style` 才不是「建了撤不回」的单向门。⚠ 集合本身(`VariableCollection`)与模式增删改名(`addMode` / `renameMode` / `removeMode`)仍未接,删光变量后空集合会留着',
    inputSchema: variablesRemoveSchema,
    run: removeVariables,
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
    name: 'figma_style_variables_list',
    title: '查看样式的值与变量绑定',
    description:
      'Figma 特有:读**样式对象自身**的值与它内部的变量绑定 —— 「变量 → 样式 → 节点」这条三层链的中间那一环**只有这里能看到**(`jsd_get_page` 的 `assets.styles` 只有 id + 名称,节点上的 `boundVariables` 又不含样式内部的绑定)。params: { styleId?, kind?: PAINT|TEXT|EFFECT|GRID, limit? }。回每条 `values`(PAINT→paints / EFFECT→effects / GRID→layoutGrids / TEXT→排版那几项)与 `boundVariables`(键是**样式档**的字段名,与节点档不同:填充那一份叫 paints,不叫 fills)。`styleId` 点名时团队库样式也能解析出来,但那条是只读的 —— 别拿它当本地样式改。绑定前后的摸底与回读都走这条',
    inputSchema: styleVariablesListSchema,
    run: listStyleVariables,
  },
  {
    name: 'figma_style_variables_apply',
    title: '批量绑定/解绑变量到样式',
    description:
      'Figma 特有:把变量绑到**样式对象的字段**上(与 `figma_variables_apply` 同形,但落点是样式:改一次,所有引用该样式的节点跟着变)。params: { bindings: [{ styleIds, boundProperty, variableId?, subField?, index?, unbind? }] }。两档词汇:① **排版档**(仅 TEXT 样式)`fontFamily / fontSize / fontStyle / fontWeight / letterSpacing / lineHeight / paragraphSpacing / paragraphIndent`(= `VariableBindableTextField`,typings :6845;走 `TextStyle.setBoundVariable` :12507);② **数组档** `paints / effects / layoutGrids`(`VariableBindable*StyleField` :6855-6860),必须给 `subField`,effects / layoutGrids 还要 `index`;paints 省略 index = 该数组全部 SOLID 项,渐变等其余 paint 原样保留。⚠ **别照抄节点档词汇**:`fills` / `strokes` 在样式上叫 `paints`,`color` 是 paints 的子字段而不是样式档字段,节点字段(width / cornerRadius / opacity …)绑不到样式上 —— 表外字段当场点名拒。⚠ 数组档的三个入口都返回**副本**,op 内部整数组赋回才落到样式上。解绑传 `unbind: true`(不用给 variableId)。回包每组带**写完立刻回读**的 `styles[].boundVariables` —— 这是这条链唯一的证据,别只看 applied 计数;节点级圆角、组件属性值绑变量走 `figma_variables_apply` / `figma_component_properties_set`,不是这条',
    inputSchema: styleVariablesApplySchema,
    run: applyStyleVariables,
  },
  {
    name: 'figma_component_properties_set',
    title: '设置实例组件属性',
    description:
      'Figma 特有:设置实例的组件属性值。params: { nodeIds, properties: {名: {type, value}} }。value 两种:标量(写死值)或 `{type:"VARIABLE_ALIAS", id}`(让该属性跟随变量,引擎签名收别名,typings :11123;id 取自 figma_variables_list)。键必须是回读到的**完整键**(带 `#序号` 后缀,见 jsd_find 的 componentProperties)。⚠ 变体属性(VARIANT)的值**不能**绑变量:变量类型表里没有 VARIANT,变体取值切换只能给字符串',
    inputSchema: componentPropertiesSetSchema,
    run: setComponentProperties,
  },
  {
    name: 'figma_component_property_add',
    title: '定义组件属性',
    description:
      'Figma 特有:定义一个组件属性,并可连带把它绑到某个内部子层(绑了才真的驱动 —— 不绑就是空壳)。params: { componentId, name, type: BOOLEAN|TEXT|INSTANCE_SWAP, defaultValue, preferredValues?, sublayerId? }。defaultValue:BOOLEAN 用布尔、TEXT 用字符串、INSTANCE_SWAP 用默认组件的节点 id;preferredValues(仅 INSTANCE_SWAP)是换绑候选 [{type: COMPONENT|COMPONENT_SET, key}]。**绑定槽由 type 推导**(BOOLEAN→visible、TEXT→characters、INSTANCE_SWAP→mainComponent),不要传槽位名。回包给 propertyName —— 那是**带唯一后缀**的键(形如 Icon#0:0),写实例值时必须用它。建好后用 jsd_create_instance + jsd_set_instance_properties 写实例值(或 figma_component_properties_set)。⚠ 只作用于 COMPONENT 节点:实例请改其主组件,变体集请改其中的 COMPONENT。**不支持 VARIANT(由变体名派生,见 jsd_combine_as_variants)与 SLOT(不在可绑的三个槽内)**',
    inputSchema: componentPropertyAddSchema,
    run: addComponentProperty,
  },
];
