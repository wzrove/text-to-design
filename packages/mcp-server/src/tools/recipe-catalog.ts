import {
  chartByCodeRecipe,
  componentPropertyRecipe,
  currentPlatform,
  designStrategyRecipe,
  htmlToDesignRecipe,
  iconGridRecipe,
  scriptRecipe,
  textReplaceRecipe,
  variableBindingRecipe,
  variantSetRecipe,
  variantSyncRecipe,
} from './prompts';

/**
 * 配方目录:把「多步套路配方」同时暴露为 MCP prompt 与 MCP resource。
 *
 * ## 为什么需要 resource 这一层(而不是只留 prompt)
 *
 * 配方原先是三条通路里最弱的一环:
 * 1. `mcp.instructions` 写了路由表(`画图表 → chart-by-code`),但**宿主普遍不注入它**。
 *    实测(claude 系 client,`app.asar.unpacked/cli/dist/*.js`)里 `instructions` 的
 *    唯一消费者是 `ChannelManager.registerChannel`,而它有硬门控
 *    —— 只认 `capabilities.experimental["claude/channel"]`,普通 server 的
 *    `instructions` 读完即弃,不进上下文。
 * 2. MCP prompt 只被转成**斜杠命令**(`available_commands_update` 推给前端 UI),
 *    要不要读由**用户**决定,模型自己够不着。
 * 3. 工具描述倒是每轮都进上下文,但那里只写了「完整配方见 prompt `chart-by-code`」
 *    —— 对模型来说是个**无法执行**的指针(prompt 不是它能调的工具)。
 *
 * 能补上闭环的只有 resource:宿主把 `ListMcpResources` / `ReadMcpResource` 当普通
 * 工具给了模型,资源本体又按需读取、不占常驻上下文。于是
 * 「工具描述里留一行可执行指针(`读 jsd://recipes/<id>`)」+「资源提供正文」构成闭环。
 *
 * ## 单一真源
 *
 * 正文**只写在 `./prompts.ts` 的 render 函数里**,本文件只加「何时用 / 参数占位」这类
 * 资源层元数据,再调用同一批函数渲染 —— 不复制正文。
 * `__tests__/recipe-resource.test.ts` 守住「目录里的每个 id 都必须是一个已注册的
 * prompt 名」,防两边漂开。
 */
export type RecipeEntry = {
  /** 与 MCP prompt 同名 —— prompt 与 resource 的对齐键,测试按它比对 */
  id: string;
  /** 资源 URI,`jsd://recipes/<id>` */
  uri: string;
  /** 与 registerPrompt 传的 title 同键(标题文案不在本文件重写) */
  titleKey: string;
  /**
   * 何时该读它。这段会出现在 `ListMcpResources` 的 description 里 ——
   * 模型只看索引就能判断要不要花一次 ReadMcpResource,所以必须写「什么任务触发」,
   * 不要写成目录摘要。
   */
  whenToUse: string;
  /** 正文里用占位符渲染,读完要自己补哪些参数 */
  argsHint?: string;
  render: () => string;
};

/** 配方索引资源 URI */
export const RECIPE_INDEX_URI = 'jsd://recipes';

/** 配方正文资源模板 */
export const RECIPE_URI_TEMPLATE = 'jsd://recipes/{id}';

export const RECIPES: RecipeEntry[] = [
  {
    id: 'design-strategy',
    uri: 'jsd://recipes/design-strategy',
    titleKey: 'prompt.designStrategy.title',
    whenToUse:
      '画布创作的通用纪律。**从零设计整页 / 界面之前先读这一条**:先摸底、结构分层(成品该多深就多深,调用才分批)、语义化命名、抽组件、归组后再布局、间距与字号阶梯、层序与遮挡、出错回滚,附示例结构树',
    render: () => designStrategyRecipe(undefined, currentPlatform()),
  },
  {
    id: 'chart-by-code',
    uri: 'jsd://recipes/chart-by-code',
    titleKey: 'prompt.chartByCode.title',
    whenToUse:
      '画图表 / 数据可视化(折线、柱状、饼图 / 环形、散点、雷达、面积、桑基、仪表盘、看板……)。自己写脚本算几何、落盘 SVG,再经 jsd_create_svg 的 svgPath 导入;含零依赖示例与引擎侧硬约束',
    argsHint:
      '参数 chart(要画什么图:种类 + 数据 + 口径)、svgPath(落盘路径,缺省 /tmp/chart.svg)',
    render: () =>
      chartByCodeRecipe('<在此写明图表种类 + 数据 + 口径>', undefined),
  },
  {
    id: 'html-to-design',
    uri: 'jsd://recipes/html-to-design',
    titleKey: 'prompt.htmlToDesign.title',
    whenToUse:
      '把 HTML 片段转成设计稿。默认走 jsd_html_to_design(SVG 保真、忽略复杂样式);要可编辑图层才改 per-type create 手工映射后 reparent 归组',
    argsHint: '参数 html(完整 HTML 片段)、name(生成节点名,可省)',
    render: () => htmlToDesignRecipe('<在此粘贴完整 HTML 片段>'),
  },
  {
    id: 'icon-grid',
    uri: 'jsd://recipes/icon-grid',
    titleKey: 'prompt.iconGrid.title',
    whenToUse: '批量插入 Lucide 图标并排成 auto-layout 网格',
    argsHint: '参数 icons(逗号分隔的图标名)、size(默认 24)、gap(默认 16)',
    render: () => iconGridRecipe('<图标名1,图标名2,…>'),
  },
  {
    id: 'script-ops',
    uri: 'jsd://recipes/script-ops',
    titleKey: 'prompt.scriptOps.title',
    whenToUse:
      '把多步画布操作合并成一次 jsd_batch 编排或一段宿主脚本。步骤多、往返多、上下文吃紧时读它(含占位符纪律与收敛复核)',
    argsHint: '参数 task(要完成的任务,留空只返回脚本化调用纪律)',
    render: () => scriptRecipe(undefined),
  },
  {
    id: 'text-replace-strategy',
    uri: 'jsd://recipes/text-replace-strategy',
    titleKey: 'prompt.textReplace.title',
    whenToUse:
      '批量改文案:在一棵子树里定位并替换文本,含命中范围、命名与回显复核纪律',
    argsHint: '参数 rootId(子树根节点 id,留空用当前选中)',
    render: () => textReplaceRecipe(undefined),
  },
  {
    id: 'variant-sync',
    uri: 'jsd://recipes/variant-sync',
    titleKey: 'prompt.variantSync.title',
    whenToUse:
      '同类实例的样式批量同步。改一处要影响全部实例时走它 —— 改主组件而不是逐个改实例(含实例子节点覆盖不生效的处置)',
    argsHint: '参数 sourceId(样板节点 id)、targetType(目标节点类型)',
    render: () => variantSyncRecipe(undefined, undefined),
  },
  {
    id: 'variable-binding',
    uri: 'jsd://recipes/variable-binding',
    titleKey: 'prompt.variableBinding.title',
    whenToUse: '变量绑定与批量套用(按当前平台变量面分流)',
    argsHint: '参数 target(目标节点 id,留空用当前选中)',
    render: () => variableBindingRecipe(undefined, currentPlatform()),
  },
  {
    id: 'variant-set',
    uri: 'jsd://recipes/variant-set',
    titleKey: 'prompt.variantSet.title',
    whenToUse:
      '变体集构建:把同族组件合成 COMPONENT_SET 并设变体属性(按平台能力位分流)',
    argsHint: '参数 family(组件族名)',
    render: () => variantSetRecipe(undefined, currentPlatform()),
  },
  {
    id: 'component-property',
    uri: 'jsd://recipes/component-property',
    titleKey: 'prompt.componentProperty.title',
    whenToUse:
      '组件属性的定义与设值(值形态 / 写入口 / 读侧 / 替代路径四件套,按平台分流)',
    argsHint: '参数 target(组件或实例 id,留空只返回做法与分流)',
    render: () => componentPropertyRecipe(undefined, currentPlatform()),
  },
];

export function findRecipe(id: string): RecipeEntry | undefined {
  return RECIPES.find((r) => r.id === id);
}

/**
 * 索引正文。写成 markdown 而不是 JSON:这份是给模型读的**路由表**,
 * 不是给程序解析的数据(要结构化的话每条的 uri 已由 ListMcpResources 给出)。
 */
export function renderRecipeIndex(): string {
  const lines = RECIPES.map(
    (r) =>
      `- \`${r.uri}\` — ${r.whenToUse}${r.argsHint == null ? '' : `\n  - ${r.argsHint}`}`,
  );
  return [
    '# text-to-design 配方索引',
    '',
    '多步套路不要临场拼工具 —— 先照配方走。用 `ReadMcpResource` 读下面任意一条的正文(按需读取,不占常驻上下文)。',
    '',
    ...lines,
    '',
    '只想概览纪律、没有具体任务时,先读 `jsd://recipes/design-strategy`。',
  ].join('\n');
}
