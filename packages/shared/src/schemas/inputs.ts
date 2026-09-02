import { z } from 'zod';

import {
  autoLayoutPropsSchema,
  cornerPropsSchema,
  strokePropsSchema,
  textPropsSchema,
  transformPropsSchema,
  visualPropsSchema,
} from './shared-props';

// update_node props (字段对齐 runtime, 复用共享 schema)
// 展平为单 object:各分段经 .shape 展开,与 .and() 交并引用同一批字段 schema,
// 解析语义等价(字段集/解析行为/错误路径一致),但 JSON Schema 呈现为一张
// 平铺属性表,没有 8 段 allOf 的认知负担。shared-props 的分段仅承担代码组织。
// 字段适用类型直接写在各字段 describe 里,与 extraContent 的未生效字段点名互补。
export const updateNodePropsSchema = z
  .object({
    name: z.string().optional(),
    pointCount: z
      .number()
      .optional()
      .describe('多边形/星形角点数(仅 POLYGON/STAR 生效)'),
    innerRadius: z
      .number()
      .optional()
      .describe('星形内半径比例(0-1,相对外半径;仅 STAR 生效)'),
    ...transformPropsSchema.shape,
    ...strokePropsSchema.shape,
    ...cornerPropsSchema.shape,
    ...textPropsSchema.shape,
    ...autoLayoutPropsSchema.shape,
    ...visualPropsSchema.shape,
    textTruncation: z
      .enum(['DISABLED', 'ENDING'])
      .optional()
      .describe(
        '文本截断(DISABLED=不截断,ENDING=末尾省略号截断),仅 Figma 生效',
      ),
    maxLines: z.number().optional().describe('文本最大行数,仅 Figma 生效'),
    fillStyleId: z
      .string()
      .optional()
      .describe('填充样式 id(团队库样式;平台无此能力时被忽略)'),
    strokeStyleId: z
      .string()
      .optional()
      .describe('描边样式 id(团队库样式;平台无此能力时被忽略)'),
    textStyleId: z
      .string()
      .optional()
      .describe('文本样式 id(团队库样式;平台无此能力时被忽略)'),
    effectStyleId: z
      .string()
      .optional()
      .describe('效果样式 id(团队库样式;平台无此能力时被忽略)'),
  })
  .strict()
  .describe(
    '要修改的属性;各字段仅在匹配的节点类型上生效(如 pointCount 仅 POLYGON/STAR、layoutMode 仅 FRAME),不匹配的字段会被忽略并在结果中提示。只接受此处列出的键,写错键名会直接报错而不是静默忽略',
  );

export const updateNodeSchema = z
  .object({
    ids: z
      .array(z.string())
      .optional()
      .describe('要修改的节点 id 列表;缺省时作用于当前选中节点'),
    matchName: z
      .string()
      .optional()
      .describe(
        '按节点 name 过滤(精确等值匹配,非模糊/包含;可用 jsd_find 先复核名称),仅命中节点被修改',
      ),
    recursive: z
      .boolean()
      .optional()
      .describe(
        '是否递归应用到子节点子树,默认 false;目标为大容器时慎用(会连坐修改全部后代)',
      ),
    props: updateNodePropsSchema.describe('要修改的属性'),
  })
  .strict();

export const findSchema = z.object({
  ids: z.array(z.string()).optional().describe('按节点 id 精确查找,优先级最高'),
  name: z.string().optional().describe('按名称模糊匹配(包含)'),
  type: z
    .string()
    .optional()
    .describe(
      '节点类型过滤,支持:SLICE/FRAME/GROUP/COMPONENT_SET/COMPONENT/INSTANCE/BOOLEAN_OPERATION/VECTOR/STAR/LINE/ELLIPSE/POLYGON/RECTANGLE/TEXT',
    ),
  recursive: z.boolean().optional().describe('是否递归查找(默认 true)'),
  depth: z
    .number()
    .optional()
    .describe('序列化深度:0=仅自身,1=含直接子节点;缺省 1'),
});

// 组件/实例操作 op 全集(与 manageComponentsSchema 的 op 枚举保持同步),
// 用于把误投到 jsd_manage_nodes 的组件操作在报错里指路到 jsd_manage_components
const COMPONENT_OPS = [
  'create_component',
  'create_instance',
  'detach_instance',
  'import_component',
  'swap_component',
  'set_instance_properties',
  'combine_as_variants',
  'copy_overrides',
  'apply_overrides',
  'sync_overrides',
];

/**
 * 节点结构操作入参:扁平结构 + 运行时按 op 精查(与 manageComponentsSchema 同范式)。
 * 不用 discriminatedUnion 生成 oneOf——根级 oneOf 有两个问题:
 * 1) 调用方漏传 op 时,JSON-Schema 校验把每个分支的缺失字段全列一遍(oneOf 复读机式报错);
 * 2) 部分客户端对「根级 oneOf 工具」的出参序列化存在缺陷,实参会在到达服务端前被丢弃
 *    (实测 7/7 复现,扁平对象工具无此现象)。扁平化后两点同时规避。
 */
export const manageNodesSchema = z
  .object({
    op: z
      .enum(
        [
          'select',
          'remove',
          'clone',
          'group',
          'ungroup',
          'flatten',
          'outline_stroke',
          'reparent',
          'repair',
        ],
        {
          error: (iss) => {
            const raw: unknown = (iss as { input?: unknown }).input;
            const v = typeof raw === 'string' ? raw : '';
            return COMPONENT_OPS.includes(v)
              ? `"${v}" 是组件/实例操作,应使用 jsd_manage_components;本工具仅支持:select|remove|clone|group|ungroup|flatten|outline_stroke|reparent|repair`
              : `无效 op${v === '' ? '(缺省)' : ` "${v}"`},本工具支持:select|remove|clone|group|ungroup|flatten|outline_stroke|reparent|repair(组件/实例操作在 jsd_manage_components)`;
          },
        },
      )
      .describe(
        '节点结构操作类型:select 设当前选中 | remove 删除(matchName 可再过滤) | clone 复制(右下偏移) | group 编组(可带 layoutMode/itemSpacing/padding* 参数) | ungroup 解组 | flatten 合并为矢量(至少 2 节点) | outline_stroke 描边转轮廓 | reparent 移到 parentId 下(缺省当前选中第一个) | repair 清理已损坏节点',
      ),
    ids: z
      .array(z.string())
      .optional()
      .describe(
        '节点 id 列表;除 remove/repair 外全部 op 必填(remove 缺省用当前选中)',
      ),
    matchName: z
      .string()
      .optional()
      .describe(
        '仅 remove:在 ids(或当前选中)范围内,仅删除 name 精确匹配的节点',
      ),
    name: z.string().optional().describe('仅 group:组名'),
    layoutMode: z
      .enum(['NONE', 'HORIZONTAL', 'VERTICAL'])
      .optional()
      .describe(
        '仅 group。自动布局方向:NONE=纯归组,子节点仅叠加,HORIZONTAL=水平排列,VERTICAL=垂直排列',
      ),
    itemSpacing: z
      .number()
      .optional()
      .describe(
        '仅 group。自动布局项间距(px);primaryAxisAlignItems=SPACE_BETWEEN 时该项被忽略(子项均匀分布)',
      ),
    paddingTop: z.number().optional().describe('仅 group。上内边距(px)'),
    paddingRight: z.number().optional().describe('仅 group。右内边距(px)'),
    paddingBottom: z.number().optional().describe('仅 group。下内边距(px)'),
    paddingLeft: z.number().optional().describe('仅 group。左内边距(px)'),
    primaryAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('仅 group。主轴尺寸模式:FIXED|AUTO'),
    counterAxisSizingMode: z
      .enum(['FIXED', 'AUTO'])
      .optional()
      .describe('仅 group。交叉轴尺寸模式:FIXED|AUTO'),
    primaryAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'])
      .optional()
      .describe(
        '仅 group。主轴对齐:MIN|MAX|CENTER|SPACE_BETWEEN;设为 SPACE_BETWEEN 时 itemSpacing 被忽略(子项均匀分布)',
      ),
    counterAxisAlignItems: z
      .enum(['MIN', 'MAX', 'CENTER'])
      .optional()
      .describe('仅 group。交叉轴对齐:MIN|MAX|CENTER'),
    parentId: z
      .string()
      .optional()
      .describe(
        '仅 reparent:目标父节点 id,缺省用当前选中第一个节点。reparent 后节点坐标按新父相对系解释,通常需手动修正 x/y',
      ),
    index: z
      .number()
      .optional()
      .describe('仅 reparent:插入位置,缺省追加到末尾;置底用 0'),
  })
  .superRefine((v, ctx) => {
    const missing = (field: string): void => {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `op=${v.op} 缺少必填字段 ${field}`,
      });
    };
    const hasIds =
      Array.isArray(v.ids) &&
      v.ids.length > 0 &&
      v.ids.every((x) => typeof x === 'string');
    switch (v.op) {
      case 'select':
      case 'clone':
      case 'group':
      case 'ungroup':
      case 'flatten':
      case 'outline_stroke':
      case 'reparent':
        if (!hasIds) missing('ids');
        break;
      case 'remove':
      case 'repair':
        break;
    }
    if (
      v.op === 'flatten' &&
      hasIds &&
      Array.isArray(v.ids) &&
      v.ids.length < 2
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['ids'],
        message: 'op=flatten 至少需要 2 个节点 id',
      });
    }
  });

/**
 * 组件操作入参:扁平结构 + 运行时按 op 精查。
 * 不用 discriminatedUnion 生成 oneOf——调用方漏传 op 时,JSON-Schema 校验会把
 * 每个分支的缺失字段全列一遍(oneOf 复读机式报错);扁平化后缺 op 只有一行错,
 * op 合法但缺字段时由 superRefine 给出中文定位。
 */
export const manageComponentsSchema = z
  .object({
    op: z
      .enum([
        'create_component',
        'create_instance',
        'detach_instance',
        'import_component',
        'swap_component',
        'set_instance_properties',
        'combine_as_variants',
        'copy_overrides',
        'apply_overrides',
        'sync_overrides',
      ])
      .describe(
        '组件操作类型;注意 combine_as_variants 与 detach_instance 在当前即时设计引擎实测不可用(详见 jsd_manage_components 工具描述)',
      ),
    ids: z
      .array(z.string())
      .optional()
      .describe(
        '节点 id 列表;除 import_component 外全部 op 必填(create_component 为要固化的节点,其余为实例/组件节点)',
      ),
    name: z
      .string()
      .optional()
      .describe(
        '名称;create_component/import_component/combine_as_variants 可选',
      ),
    key: z
      .string()
      .optional()
      .describe('团队库组件唯一标识 Key(仅 import_component 必填)'),
    componentId: z
      .string()
      .optional()
      .describe('目标组件(COMPONENT)节点 id(仅 swap_component 必填)'),
    properties: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        '变体属性名→值,如 {"状态":"禁用"}(仅 set_instance_properties 必填);可调属性需从 jsd_find/jsd_get_selection 返回的 variantGroupProperties 获取,属性名必须完全匹配',
      ),
    sourceId: z
      .string()
      .optional()
      .describe(
        '源实例(INSTANCE)节点 id;copy_overrides/apply_overrides/sync_overrides 必填',
      ),
    swapToSource: z
      .boolean()
      .optional()
      .describe(
        '套用时是否把目标实例 swap 成源组件,默认 false(swap 会丢失目标既有覆盖,需显式开启)',
      ),
  })
  .superRefine((v, ctx) => {
    const missing = (field: string): void => {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `op=${v.op} 缺少必填字段 ${field}`,
      });
    };
    const hasIds =
      Array.isArray(v.ids) &&
      v.ids.length > 0 &&
      v.ids.every((x) => typeof x === 'string');
    switch (v.op) {
      case 'create_component':
      case 'create_instance':
      case 'detach_instance':
      case 'swap_component':
      case 'set_instance_properties':
      case 'combine_as_variants':
        if (!hasIds) missing('ids');
        break;
      case 'import_component':
        if (typeof v.key !== 'string' || v.key.length === 0) missing('key');
        break;
      case 'copy_overrides':
        if (typeof v.sourceId !== 'string' || v.sourceId.length === 0)
          missing('sourceId');
        break;
      case 'apply_overrides':
        if (!hasIds) missing('ids');
        if (typeof v.sourceId !== 'string' || v.sourceId.length === 0)
          missing('sourceId');
        break;
      case 'sync_overrides':
        if (!hasIds) missing('ids');
        if (typeof v.sourceId !== 'string' || v.sourceId.length === 0)
          missing('sourceId');
        break;
    }
    if (v.op === 'swap_component' && typeof v.componentId !== 'string') {
      missing('componentId');
    }
    if (
      v.op === 'set_instance_properties' &&
      (v.properties == null || typeof v.properties !== 'object')
    ) {
      missing('properties');
    }
  });

export const exportSchema = z.object({
  ids: z
    .array(z.string())
    .min(1)
    .describe(
      '必填。要导出的节点 id 列表(数组);只导一个节点也要写成数组,如 ["123:456"]。字段名是 ids,不是 nodeId。',
    ),
  format: z
    .enum(['PNG', 'JPG', 'SVG', 'PDF'])
    .optional()
    .describe('导出格式,默认 PNG'),
  scale: z.number().optional().describe('缩放倍率(PNG/JPG),默认 1'),
  savePath: z.string().optional().describe('落盘文件绝对路径,如 /tmp/icon.png'),
  includeDataUrl: z
    .boolean()
    .optional()
    .describe('是否同时返回 base64 dataURL,默认 false'),
});

export const listFontsSchema = z.object({});
export const listStylesSchema = z.object({});
export const getPageStructureSchema = z.object({});

/** 图片填充入参:server 读本地文件,经二进制通道传给插件 */
export const fillImageSchema = z.object({
  ids: z.array(z.string()).describe('要填充图片的节点 id 列表'),
  sourcePath: z.string().describe('本地图片文件绝对路径,如 /tmp/poster.png'),
});
export type FillImageParams = z.infer<typeof fillImageSchema>;

/** 平台特有操作(platform_op)入参:通用通道,op 名由 ping.capabilities 告知 */
export const platformOpParamsSchema = z.object({
  op: z
    .string()
    .describe(
      '平台特有操作名(如 figma_variables_create)。先 jsd_ping 看 capabilities 与平台支持列表',
    ),
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('操作参数,结构随 op 而定'),
});
export type PlatformOpParams = z.infer<typeof platformOpParamsSchema>;
