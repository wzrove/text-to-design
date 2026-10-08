import type { McpServer } from '@modelcontextprotocol/server';
import {
  DOMAIN_CAPABILITY,
  PLATFORM_LABEL,
  type PlatformKey,
  platformDomainFact,
  platformMethodParamAcceptedKinds,
} from 'text-to-design-shared';
import { z } from 'zod';
import type { ToolHandle } from '../core/registry';
import type { McpI18n } from '../i18n';
import { getPlatformState } from '../platform-state';
import {
  componentWriteText,
  variableFaceText,
  variantStrategyText,
} from './platform-facts';

/**
 * 配方 prompt:**按当前平台分流**。
 *
 * ## 为什么提示词要读平台状态
 *
 * 提示词此前是**平台盲**的:拿不到平台,只能把三平台的分支**全量内联**进每一份配方 ——
 * Figma 用户也得读一遍「jsDesign 上合成路径必崩」。后果不只是浪费上下文:同一条平台
 * 事实在工具描述、platformNote、配方三处各写一份,**写完就开始漂**(典型:
 * `core/host.ts` 的契约注释停在「两平台都收 string|boolean」,第三平台接入后没回填)。
 *
 * 现在两条纪律:
 * 1. **事实与句子都不在本文件重写** —— 数据取 `dicts/platform-knowledge.ts`,句子取
 *    `./platform-facts.ts`(工具描述走同一份句子),本文件只负责编排;
 * 2. **平台状态在调用期读** —— `getPlatformState()` 是 daemon 的进程级缓存(`ping` 时
 *    写入)。绝不能改到**装配期**读:`buildServer` 早于插件连接(见 0030),那时永远是
 *    `null`,等于把「平台盲」换成「平台恒空」,症状一样却更难查。
 *    未探测到平台(`null`)时给**保守文案**:先 `jsd_ping` 读能力位,再按它选路。
 */
export function registerPrompts(
  server: McpServer,
  i18n: McpI18n,
): ToolHandle[] {
  const htmlToDesign = server.registerPrompt(
    'html-to-design',
    {
      title: i18n.t('prompt.htmlToDesign.title'),
      description: i18n.t('prompt.htmlToDesign.description'),
      argsSchema: z.object({
        html: z.string().describe('要转换的 HTML 片段'),
        name: z.string().optional().describe('生成节点的名称,默认 html-design'),
      }),
    },
    ({ html, name }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `请把下面的 HTML 转成设计稿。默认走 jsd_html_to_design(SVG 保真,忽略复杂样式);需要可编辑图层时才改用 per-type create 工具(jsd_create_frame 等)手工映射(容器→FRAME、文本→TEXT、图形→VECTOR)后 reparent 归组。\n\nHTML:\n\`\`\`\n${String(html)}\n\`\`\`${name == null ? '' : `\n节点名:${String(name)}`}`,
          },
        },
      ],
    }),
  );

  const iconGrid = server.registerPrompt(
    'icon-grid',
    {
      title: i18n.t('prompt.iconGrid.title'),
      description: i18n.t('prompt.iconGrid.description'),
      argsSchema: z.object({
        icons: z
          .string()
          .describe('图标名列表,逗号分隔,如 house,search,settings'),
        size: z
          .string()
          .optional()
          .describe('单个图标边长 px 数字字符串,默认 "24"'),
        gap: z.string().optional().describe('图标间距 px 数字字符串,默认 "16"'),
      }),
    },
    ({ icons, size, gap }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `请插入图标网格:1) jsd_create_frame 建一个 FRAME 容器;2) 每个图标各调一次 jsd_create_icon(size=${Number(size) || 24});3) jsd_reparent_nodes 把全部图标移入容器;4) jsd_set_layout 给容器设 auto-layout(layoutMode=HORIZONTAL,itemSpacing=${Number(gap) || 16},counterAxisAlignItems=CENTER)。\n图标列表: ${String(icons)}`,
          },
        },
      ],
    }),
  );

  const scriptOps = server.registerPrompt(
    'script-ops',
    {
      title: i18n.t('prompt.scriptOps.title'),
      description:
        '把多步画布操作合并为一次 ops 数组或一段宿主脚本执行,减少工具往返与上下文占用',
      argsSchema: z.object({
        task: z
          .string()
          .optional()
          .describe('要完成的任务描述(可选,留空只返回脚本化调用纪律)'),
      }),
    },
    ({ task }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: scriptRecipe(task == null ? undefined : String(task)),
          },
        },
      ],
    }),
  );

  const designStrategy = server.registerPrompt(
    'design-strategy',
    {
      title: i18n.t('prompt.designStrategy.title'),
      description:
        '画布创作的通用纪律:先摸底、一层只建一层、语义化命名、归组后再布局、间距与字号阶梯、出错回滚,附示例结构树',
      argsSchema: z.object({
        screen: z
          .string()
          .optional()
          .describe('要设计的界面名称,如「登录页」;留空只返回通用纪律'),
      }),
    },
    ({ screen }) => ({
      messages: [
        {
          // 策略类内容以 assistant 身份下发,读起来像模型自己的既有约定;
          // 带具体参数的配方(design-card 等)仍用 user 角色
          role: 'assistant' as const,
          content: {
            type: 'text' as const,
            text: designStrategyRecipe(
              screen == null ? undefined : String(screen),
              currentPlatform(),
            ),
          },
        },
      ],
    }),
  );

  const textReplace = server.registerPrompt(
    'text-replace-strategy',
    {
      title: i18n.t('prompt.textReplace.title'),
      description:
        '大改文案的安全流程:jsd_clone_node 留底 → 按语义分块 → jsd_set_text ids 批量替换 → 逐块导小图复核',
      argsSchema: z.object({
        rootId: z.string().optional().describe('根节点 id;留空取当前选中'),
      }),
    },
    ({ rootId }) => ({
      messages: [
        {
          role: 'assistant' as const,
          content: {
            type: 'text' as const,
            text: textReplaceRecipe(
              rootId == null ? undefined : String(rootId),
            ),
          },
        },
      ],
    }),
  );

  const variantSync = server.registerPrompt(
    'variant-sync',
    {
      title: i18n.t('prompt.variantSync.title'),
      description:
        '把一个实例的样式/文案批量套用到多个同类实例(卡片组/列表项/表单组),变体属性走组件操作',
      argsSchema: z.object({
        sourceId: z.string().optional().describe('源实例 id;留空取当前选中'),
        targetType: z
          .string()
          .optional()
          .describe('目标实例的类型过滤,如 INSTANCE;留空按名称匹配'),
      }),
    },
    ({ sourceId, targetType }) => ({
      messages: [
        {
          role: 'assistant' as const,
          content: {
            type: 'text' as const,
            text: variantSyncRecipe(
              sourceId == null ? undefined : String(sourceId),
              targetType == null ? undefined : String(targetType),
            ),
          },
        },
      ],
    }),
  );

  const variableBinding = server.registerPrompt(
    'variable-binding',
    {
      title: i18n.t('prompt.variableBinding.title'),
      description:
        '变量绑定与批量套用:先看本平台有没有变量能力面,再读绑定、建变量、批量绑定;没有变量面的平台给替代路径',
      argsSchema: z.object({
        target: z
          .string()
          .optional()
          .describe('要绑定的节点或范围描述;留空只返回做法与分流'),
      }),
    },
    ({ target }) => ({
      messages: [
        {
          role: 'assistant' as const,
          content: {
            type: 'text' as const,
            text: variableBindingRecipe(
              target == null ? undefined : String(target),
              currentPlatform(),
            ),
          },
        },
      ],
    }),
  );

  const variantSet = server.registerPrompt(
    'variant-set',
    {
      title: i18n.t('prompt.variantSet.title'),
      description:
        '变体集构建:按能力位 inPlaceVariants 分流(原位合并 / 多主件兜底),含命名与建后回读复核',
      argsSchema: z.object({
        family: z
          .string()
          .optional()
          .describe('组件族名,如 Nav;留空只返回做法与分流'),
      }),
    },
    ({ family }) => ({
      messages: [
        {
          role: 'assistant' as const,
          content: {
            type: 'text' as const,
            text: variantSetRecipe(
              family == null ? undefined : String(family),
              currentPlatform(),
            ),
          },
        },
      ],
    }),
  );

  const componentProperty = server.registerPrompt(
    'component-property',
    {
      title: i18n.t('prompt.componentProperty.title'),
      description:
        '组件属性的定义与设值:定义走平台 op、设值走 jsd_set_instance_properties,并按当前平台给出能收的值形态',
      argsSchema: z.object({
        target: z
          .string()
          .optional()
          .describe('组件或实例 id;留空只返回做法与分流'),
      }),
    },
    ({ target }) => ({
      messages: [
        {
          role: 'assistant' as const,
          content: {
            type: 'text' as const,
            text: componentPropertyRecipe(
              target == null ? undefined : String(target),
              currentPlatform(),
            ),
          },
        },
      ],
    }),
  );

  // 配方是静态引导词,不依赖插件连接 → 恒可用
  return [
    htmlToDesign,
    iconGrid,
    scriptOps,
    designStrategy,
    textReplace,
    variantSync,
    variableBinding,
    variantSet,
    componentProperty,
  ].map((handle) => Object.assign(handle, { alwaysEnabled: true }));
}

/**
 * 当前平台,**调用期**读 daemon 的进程级缓存(`ping` 时写入,插件断开即清空)。
 *
 * 为什么不能提到装配期:`buildServer` 在插件连接之前就跑完了(0030),那时缓存必然
 * 是空的 —— 提前读等于把「不区分平台」变成「永远没有平台」。
 */
function currentPlatform(): PlatformKey | null {
  return getPlatformState()?.platform ?? null;
}

/** 当前平台是否声明了某条能力位(claim 的唯一真源是插件侧 meta.capabilities,经 ping 上报) */
function claims(
  capability: (typeof DOMAIN_CAPABILITY)[keyof typeof DOMAIN_CAPABILITY],
): boolean {
  return getPlatformState()?.capabilities.includes(capability) === true;
}

/** 脚本化调用配方:压缩工具往返次数与上下文占用 */
function scriptRecipe(task?: string): string {
  const head =
    task == null
      ? '请按以下「脚本化」纪律调用 text-to-design 工具:'
      : `请用「脚本化」方式完成下面的任务:\n${task}\n\n执行要求:`;
  return `${head}
1) 多步流程一次成型:优先 jsd_batch 编排(create→reparent→update、find→批量修改、图标×N 等);宿主有代码执行工具时也可写一段脚本连续 await 多个 tools.jsd_*。
2) 中间值只在管道内流动:上游结果用双花括号占位符(步骤id.字段路径)注入下游参数(脚本内用变量传递);每步只提取后续需要的字段,不回传完整序列化结果。**占位符只在同一次调用的本批次内有效** —— 跨批次引用会报「占位符引用的步骤不存在或未成功」并中止整批,跨批次请硬编码上一步回显里的真实 id。
3) 收敛:最后只做一次 jsd_get_selection(depth=1) 总复核,不要每步都复核。`;
}

/** 设计策略总纲:把 server.ts 里 INSTRUCTIONS 的三条纪律展开成可照着走的完整流程 */
function designStrategyRecipe(
  screen: string | undefined,
  platform: PlatformKey | null,
): string {
  const target = screen == null ? '当前设计' : `「${screen}」`;
  // 多状态组件那段按能力位分流,句子来自 platform-facts(与 combine_as_variants 的描述同源)
  const multiState = variantStrategyText(
    platform,
    platform == null ? null : claims(DOMAIN_CAPABILITY.variants),
  );
  return `# 画布创作纪律

1) 先摸底再动手:jsd_get_selection(depth=2) 看现状(名称/类型/尺寸/填充/子结构),已有节点用 jsd_find 精确定位,不要重复创建同名元素。
2) 一层只建一层:每个界面先建主容器 FRAME,再分区放内容。复杂结构用 jsd_batch 编排多个 per-type create 步骤一次建完,不要用 children 深嵌套(易整体失败)。
3) 命名语义化:用「登录页 / Logo 容器 / 邮箱输入 / 主按钮」这类说明用途的名字,不用「矩形 1」「Frame 2」;同一批元素命名风格保持一致。
4) 归组后再布局:jsd_reparent_nodes 把文本等元素移入目标容器(**parentId 显式传容器 id**,别依赖「当前选中第一个」的缺省值;跨父级移动会保持节点绝对位置,不用手动摆回 x/y,移入 auto-layout 容器时位置交给布局);auto-layout(layoutMode/itemSpacing/padding*/primaryAxisAlignItems 等)最后用 jsd_set_layout 单独设,别在建节点时混着传。
5) 间距与字号阶梯:主标题 > 正文标签 > 按钮文本 > 辅助说明;同级元素间距一致,用 itemSpacing 统一控制,不靠手调坐标凑。**长段落要换行**:TEXT 缺省按内容撑开(textAutoResize 缺省 WIDTH_AND_HEIGHT),只给 width 会被引擎改成 NONE 且高度不随内容重算 —— 要固定宽+自动换行传 width + textAutoResize:"HEIGHT",要固定框尺寸传 "NONE"。**字体取 jsd_list_fonts 的 fonts[] 成对值**:family 用 fonts[].family 原样(如 SourceHanSansCN_family),style 用同一项的全名(如 SourceHanSansCN-Bold,不是简称 "Bold")—— 写错会被静默忽略、退回默认字面,结果 warnings 会点名。
6) 视觉顺序:自上而下按阅读顺序排布,主操作按钮放在输入项之后,次要链接(忘记密码/注册)放最后。
7) 层序与遮挡:序列化里每个节点都带 \`z\`(= 父级 children 下标 = 绘制顺序,0 = 最底层,越大越靠上),判断谁压谁直接读 z。要调层序用 jsd_reparent_nodes + index(= 目标 z);auto-layout 容器同样支持,若引擎没落位会明确报错,那就改 itemSpacing / 对齐。别靠「新建一个节点压上去」改遮挡。
8) 样式落点:纯描边图形只传 strokes 就行(fills 会被自动置空,不会变灰块);批量刷色给 ids + recursive(recursive 只作用于后代,容器自己不会被套上方框,要给容器也上色才传 includeSelf=true);实例子节点(位于 INSTANCE 内)的样式覆盖不保证渲染生效 —— 命中时结果的 warnings 会直接给出主组件里对应子节点的 id,改主组件即所有实例继承,只要单实例不同就先 jsd_detach_instance。多状态组件:${multiState}
9) 批量回显都做了摘要裁剪(jsd_batch 的节点只留 id/name/type/x/y):含图标/矢量克隆的批次要另配一次 jsd_export 目视验收,别拿回显当验收证据。
10) 出错回滚:ok=false 或「没找到 X 节点」→ jsd_find 复核 id 是否已失效(可能被连坐删除),必要时 jsd_repair_nodes 清理后重试。**结果 warnings 一律读** —— 它点名的都是「回显成功却没生效」:能力门控字段被忽略、字段回读不一致(fontName 字重被降级 / TEXT 的 width 被 auto-resize 吃掉)、根节点 x/y 被 placement 覆盖;含删除/移父的批次还会报同层几何漂移(引擎把没碰到的兄弟节点静默挪走),照 warnings 给的原值回填,别把它当样式问题排查。
11) 收敛复核:整批做完只做一次 jsd_get_selection(depth=1),或 jsd_export({ids:[要看的节点id], scale:0.5}) 导小图看效果(ids 为必填数组);**关键视觉改动靠导图目检,回显不等于生效**,不要每步都读一遍。

示例结构(登录页):
- 登录页(FRAME)
  - Logo 容器(FRAME)
  - 欢迎语(TEXT)
  - 输入区(FRAME)
    - 邮箱输入(FRAME:标签 TEXT + 输入框 RECTANGLE)
    - 密码输入(FRAME:标签 TEXT + 输入框 RECTANGLE)
  - 主按钮(FRAME + TEXT)
  - 辅助链接(FRAME:忘记密码 TEXT + 注册 TEXT)

${target}按这条链走;多步合并时优先用 jsd_batch 编排,中间 id 不回传模型。`;
}

/** 文本批量替换策略:安全副本 + 语义分块 + 逐块复核,避免一次性全改后无法回退 */
function textReplaceRecipe(rootId?: string): string {
  const root =
    rootId == null
      ? '当前选中(先用 jsd_get_selection 拿到根 id)'
      : `节点 ${rootId}`;
  return `# 文本批量替换

## 1. 摸底与分块
- 对 ${root} 先 jsd_get_selection 看结构,按语义把文本分成几块:表格按行或列、卡片按「同名字段一组」、表单按「标签 + 输入」一组、导航按菜单项一组。
- 不按坐标硬切;语义相关的文本应同批处理,这样一次 jsd_set_text 就能覆盖一整块。

## 2. 先留安全副本
- jsd_clone_node 复制一份原文案版本。确认改完没问题再删(或 jsd_rename_node 重命名为「原文案备份」留档)。

## 3. 分块批量替换
- 每块一次 jsd_set_text:ids 传该块全部文本节点 id,逐条改 characters;需要时连带 fontSize/lineHeight 一起调,避免改完溢出容器。
- ids 来自上一步查询时,用 jsd_batch 的 {{步骤id.字段路径}} 占位符直接串起来,中间 id 不回传模型。

## 4. 逐块复核
- 每替换完一块,jsd_export({ids:[该块节点id], scale:0.5}) 导出看一眼:文字是否溢出容器、层级有没有乱、间距有没有被撑开。
- 有问题先修当前块再继续下一块,不要把所有错误攒到最后。

## 5. 收尾
- 全部完成后只做一次 jsd_get_selection(depth=1) 总复核,并清理临时副本。`;
}

/** 同类实例样式批量同步:取源实例属性 → 定位目标 → 批量套用,变体属性走组件操作 */
function variantSyncRecipe(sourceId?: string, targetType?: string): string {
  const source =
    sourceId == null
      ? '当前选中(先 jsd_get_selection 确认)'
      : `节点 ${sourceId}`;
  const target =
    targetType == null
      ? '按名称匹配目标实例'
      : `type=${targetType} 过滤目标实例`;
  return `# 同类实例样式批量同步

## 适用场景
把一个实例的样式/文案套用到多个同类实例(卡片组、列表项、表单组……),避免逐个手改。

## 1. 取源实例属性
- 对 ${source} 用 jsd_get_selection(depth=2) 确认它是可复用的 INSTANCE,并记录源 id。

## 2. 定位目标实例
- jsd_find(${target}) 拿到全部目标实例 id;缺的实例用 jsd_create_instance 补建。

## 3. 批量套用(优先引擎级)
- 首选 jsd_sync_overrides:sourceId=源实例 id,ids=全部目标 id,一次完成「复制+套用」(自动同步变体/组件属性/可见样式文本,不动位置)。
- 需要先审后套或多次套用同一快照时,用两段式:先 jsd_copy_overrides(sourceId) 拿到 snapshotId,再 jsd_apply_overrides(sourceId, ids) 批量套用(可加 swapToSource=true 把目标换绑成源组件)。
- 引擎不支持时再退化为手工:jsd_set_fill_color / jsd_set_text 等 ids=[目标] 填字段 + jsd_set_instance_properties 设变体值。

## 4. 复核
- jsd_export({ids:[抽查节点id], scale=0.5}) 抽查一张,确认间距与层级没被撑乱;再 jsd_get_selection(depth=1) 总复核。`;
}

/** 变量绑定与批量套用:本平台变量面取自事实表,做法是通用的调用纪律 */
function variableBindingRecipe(
  target: string | undefined,
  platform: PlatformKey | null,
): string {
  const scope = target == null ? '目标节点' : target;
  const face = variableFaceText(platform);
  const writeOps = platformDomainFact(platform, 'variables')?.write ?? [];
  const hasWrite = writeOps.length > 0;
  // 没有写入口时**不给**批量绑定的操作步骤:写了也没入口用,还会和上一节「本平台没有变量面」自相矛盾
  const howto = hasWrite
    ? `## 3. 批量绑定别逐个往返
- 建变量时**一次传完**变量列表(失败整体回滚),拿到 collectionId 与 variables[].id;
- 绑定一次传 \`nodeIds\` 多个节点 + \`boundProperty\` + \`variableId\`,不要一个节点一次调用;
- 整条链(建变量 → 绑定 → 回读复核)合并进 jsd_batch,中间 id 用 {{步骤id.字段路径}} 占位符,不回传模型。

## 4. 复核(写后必须回读)
- 回读节点上的绑定,比对里面的 variableId 与你要绑的是同一个 —— **回显成功不等于绑上了**;
- 涉及视觉的改动再 jsd_export({ids:[节点id], scale:0.5}) 导小图目检一次;
- 结果的 warnings 一律读:绑定类字段被忽略时会在这里点名。`
    : `## 3. 本平台没有可用的变量入口,本节跳过
- 别去试变量 op(daemon 会拦成 platform_unsupported,白跑一趟往返)。
- 统一色板 / 间距按第 2 节的替代路径做;要批量复用样式走 variant-sync 配方(COMPONENT + jsd_sync_overrides)。

## 4. 复核
- 若文档里本来就有绑定(别的平台建的),回读时按字段名比对;本平台读不到绑定字段时,结果里不会出现该键,别把「没有该键」当成「绑定丢了」。`;
  const existsLine = hasWrite
    ? `- 读路径就是写侧的 \`boundProperty\` 词汇,值里的 id **可直接回喂**写入口,不用改名、不用补名称。
- 引擎口径原样保留:有**独立圆角**的节点上,圆角绑定会表现为 topLeftRadius / topRightRadius / bottomLeftRadius / bottomRightRadius 四条(不归一成 cornerRadius)。`
    : '- 本平台的读侧也不提供绑定字段,所以下面讲的字段形状只在有变量面的平台上成立 —— 看一眼知道有这回事即可,别在本平台找它。';
  return `# 变量绑定与批量套用(${scope})

## 1. 本平台的变量面
- ${face}

## 2. 摸清现状再动手
- 读节点上的变量绑定(字段名见上一节):键是引擎的可绑定字段名,值的三态由引擎决定 —— 标量字段是单个别名;fills / strokes / effects / layoutGrids / textRangeFills 是别名数组;componentProperties 是按属性名索引的别名表。**键在 = 至少有一条绑定**(无绑定或平台不提供该字段时整个键省略)。
${existsLine}

${howto}`;
}

/** 变体集构建:分流依据是能力位,兜底写法取自事实表 */
function variantSetRecipe(
  family: string | undefined,
  platform: PlatformKey | null,
): string {
  const name = family == null ? '组件族' : `组件族「${family}」`;
  const strategy = variantStrategyText(
    platform,
    platform == null ? null : claims(DOMAIN_CAPABILITY.variants),
  );
  const readField =
    platformDomainFact(platform, 'variants')?.read ?? 'variantProperties';
  return `# ${name}的变体集构建

## 1. 先分流(判据是能力位,不是平台名)
- ${strategy}

## 2. 前置
- 只收 COMPONENT(**实例不能直接合成**)—— 每个状态各做成一个 COMPONENT,不足两个先 jsd_create_component。
- **集合已经存在、只是要加一个状态**:用集合级 op 直接加成分(有这组 op 的平台),别再另建组件去合并 —— 合并是「从零造集合」的动作。
- 每个主件先把**自己的**尺寸与布局做完再合并:成员自身没排好,合并后集合里就是一堆歪的。

## 3. 维度与取值怎么定
- 按第 1 节选定的路子走:**有**集合级管理入口的平台(名单见 jsd_ping 的 platformOps)直接建维度 / 改取值,**别**靠名字;**没有**的平台:变体属性由主件的**名字**承载,对不上就改名字后重新合并,别绕过名字硬塞属性值 —— 名字是引擎的入口,属性值是它的投影。
- 两条路子共同的验收:动完手立刻回读一次 —— 维度与**可选值**读组件集上的 \`variantGroupProperties\`(该平台没有这个字段时用平台提供的查看 op),单个节点的当前取值读 \`${readField}\`;确认引擎认的就是你要的那组再往下走。

## 4. 取用
- jsd_create_instance 按 COMPONENT 生成实例;切换状态用 jsd_set_instance_properties(变体属性传字符串,如 {"状态":"禁用"})。

## 5. 复核
- jsd_find 回读每个成员/实例的取值,确认属性与取值集合完整;
- jsd_export({ids:[集合id], scale:0.5}) 导小图确认成员排布与间距,回显不算验收。`;
}

/** 组件属性的定义与设值:能收的值形态取自第四类登记,不在这里手写平台差异 */
function componentPropertyRecipe(
  target: string | undefined,
  platform: PlatformKey | null,
): string {
  const scope = target == null ? '目标组件/实例' : target;
  // 只出 componentWriteText:它已经含「值形态 / 写入口 / 读侧 / 替代路径」四件,再叠一遍
  // componentFaceText 会把「读不到 componentProperties」说两遍(实测渲染出来就是重复句)
  const write = componentWriteText(platform);
  const kinds = platformMethodParamAcceptedKinds(platform, 'setProperties');
  const allowsBoolean = kinds == null ? true : kinds.includes('boolean');
  const allowsAlias = kinds == null ? true : kinds.includes('variableAlias');
  const valueHint = [
    `- 变体属性传字符串(如 {"状态":"禁用"})。`,
    allowsBoolean
      ? '- 布尔属性传布尔(如 {"显示图标":false});文本属性传字符串。'
      : '- **布尔 / 文本这类非字符串值不在本平台签名里**(见上一节)⇒ 没有签名支撑,传过去不算数。要这类效果就换设计:jsd_detach_instance 后直接改子节点,或改主组件让所有实例继承。',
    allowsAlias
      ? '- 需要显式类型或换绑候选时传 {"type":"INSTANCE_SWAP","value":"1:2"}。'
      : '- 换绑属性(INSTANCE_SWAP):本平台签名收**字符串**,所以直接传组件 id/键就行;**对象形态**({"type":"INSTANCE_SWAP",...})只有能收变量别名的签名才认(见上一节)。要整组件换绑用 jsd_swap_component。',
    '- 值形态以本平台 `setProperties` 签名为准(见上一节),不在签名里的形态不是「会被忽略」而是「本就没这个入口」。',
  ].join('\n');
  return `# 组件属性的定义与设值(${scope})

## 1. 分清两件事(混起来是最常见的错)
- **定义**:在 COMPONENT / COMPONENT_SET 上建属性。入口是平台 op,名单先经 jsd_ping 的 platformOps 确认(不同平台各自一套,没有统一入口)。
- **设值**:在 INSTANCE 上给值,三平台同名入口 \`jsd_set_instance_properties\`(不在组件本体上设值)。

## 2. 本平台的事实${platform == null ? '(未探测到平台 —— 下面按平台分别列出)' : `(${PLATFORM_LABEL[platform]})`}
- ${write}

## 3. 值怎么传
${valueHint}

## 4. 读属性名与可选值
- 先 jsd_find / jsd_get_selection 读:取值读 \`variantProperties\`,组件属性读 \`componentProperties\`(读不到的平台上只有前者);
- 可选值读**组件集**上的 \`variantGroupProperties\`(属性名 → 可选值集合);
- 属性名必须与读到的键**完全一致**;宿主侧键可能是属性 id(如 Property 1#1:0),门面会自动归一,传名字即可。

## 5. 批量设值
- jsd_set_instance_properties 的 ids 一次传多个同类实例;要把整套覆盖从源实例复制到一批目标用 jsd_sync_overrides;
- 多实例 + 多属性合并进 jsd_batch,中间 id 用占位符,不回传模型。

## 6. 复核
- 回读 componentProperties / variantProperties 的 value 与期望比对 —— 写后回读才算验收;
- 实例子节点(INSTANCE 内)的样式覆盖不保证渲染生效:命中时结果 warnings 会给出主组件里对应子节点的 id,改主组件即全实例继承;
- warnings 一律读:被忽略的字段、回读不一致(fontName 字重降级等)都在那里点名。`;
}
