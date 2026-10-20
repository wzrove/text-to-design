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
  layoutHintText,
  resourceRelationText,
  reuseGuideText,
  variableBindBulkText,
  variableBindShapeText,
  variableBindVerifyText,
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
            text: htmlToDesignRecipe(
              String(html),
              name == null ? undefined : String(name),
            ),
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
            text: iconGridRecipe(
              String(icons),
              Number(size) || 24,
              Number(gap) || 16,
            ),
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
        '画布创作的通用纪律:先查可复用件(组件/变体/样式/变量怎么选、怎么复用)、再摸底、结构分层(成品该多深就多深,调用才分批)、语义化命名、归组后再布局(auto-layout 判据 + 最容易漏掉的分区清单)、间距与字号阶梯、出错回滚,附示例结构树',
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

  const autoLayout = server.registerPrompt(
    'auto-layout',
    {
      title: i18n.t('prompt.autoLayout.title'),
      description: i18n.t('prompt.autoLayout.description'),
      argsSchema: z.object({
        target: z
          .string()
          .optional()
          .describe(
            '要上布局的容器 / 分区描述,如「标签栏」「参数行」;留空返回通用纪律',
          ),
      }),
    },
    ({ target }) => ({
      messages: [
        {
          // 与 design-strategy 同:纪律类内容以 assistant 身份下发
          role: 'assistant' as const,
          content: {
            type: 'text' as const,
            text: autoLayoutRecipe(
              target == null ? undefined : String(target),
              currentPlatform(),
            ),
          },
        },
      ],
    }),
  );

  // 配方是静态引导词,不依赖插件连接 → 恒可用
  const chartByCode = server.registerPrompt(
    'chart-by-code',
    {
      title: i18n.t('prompt.chartByCode.title'),
      description: i18n.t('prompt.chartByCode.description'),
      argsSchema: z.object({
        chart: z
          .string()
          .describe(
            '要画什么图 / 数据可视化(种类 + 数据 + 口径),如「按月的毛利率与净利率双轴折线」「各地区销售额占比环形图」「日活趋势面积图」',
          ),
        svgPath: z
          .string()
          .optional()
          .describe('生成的 .svg 落盘路径,缺省 /tmp/chart.svg'),
      }),
    },
    ({ chart, svgPath }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: chartByCodeRecipe(
              String(chart),
              svgPath == null ? undefined : String(svgPath),
            ),
          },
        },
      ],
    }),
  );

  return [
    htmlToDesign,
    iconGrid,
    scriptOps,
    designStrategy,
    autoLayout,
    textReplace,
    variantSync,
    variableBinding,
    variantSet,
    componentProperty,
    chartByCode,
  ].map((handle) => Object.assign(handle, { alwaysEnabled: true }));
}

/**
 * 当前平台,**调用期**读 daemon 的进程级缓存(`ping` 时写入,插件断开即清空)。
 *
 * 为什么不能提到装配期:`buildServer` 在插件连接之前就跑完了(0030),那时缓存必然
 * 是空的 —— 提前读等于把「不区分平台」变成「永远没有平台」。
 */
export function currentPlatform(): PlatformKey | null {
  return getPlatformState()?.platform ?? null;
}

/**
 * 多行句子挂进上一级项目符号:`platform-facts` 给的是**平铺**的若干行(工具描述里也是
 * 平铺用的),配方里要缩进才能成为第 0 条的子项 —— 缩进是排版,不是事实,所以放在这里。
 */
function indentLines(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? line : prefix + line))
    .join('\n');
}

/** 当前平台是否声明了某条能力位(claim 的唯一真源是插件侧 meta.capabilities,经 ping 上报) */
function claims(
  capability: (typeof DOMAIN_CAPABILITY)[keyof typeof DOMAIN_CAPABILITY],
): boolean {
  return getPlatformState()?.capabilities.includes(capability) === true;
}

/**
 * HTML 转设计稿配方。
 *
 * 抽成导出函数而非内联在 registerPrompt 里:同一份文案还要作为资源
 * `jsd://recipes/html-to-design` 提供(宿主普遍不注入 mcp.instructions,
 * 资源是模型能自己 `ReadMcpResource` 摘到的通路)。两份文案必须同源。
 */
export function htmlToDesignRecipe(html: string, name?: string): string {
  return `请把下面的 HTML 转成设计稿。默认走 jsd_html_to_design(SVG 保真,忽略复杂样式);需要可编辑图层时才改用 per-type create 工具(jsd_create_frame 等)手工映射(容器→FRAME、文本→TEXT、图形→VECTOR)后 reparent 归组。\n\nHTML:\n\`\`\`\n${html}\n\`\`\`${name == null ? '' : `\n节点名:${name}`}`;
}

/** 图标网格配方;同 `htmlToDesignRecipe`,资源 `jsd://recipes/icon-grid` 复用本函数 */
export function iconGridRecipe(icons: string, size = 24, gap = 16): string {
  return `请插入图标网格:1) jsd_create_frame 建一个 FRAME 容器;2) 每个图标各调一次 jsd_create_icon(size=${size});3) jsd_reparent_nodes 把全部图标移入容器;4) jsd_set_layout 给容器设 auto-layout(layoutMode=HORIZONTAL,itemSpacing=${gap},counterAxisAlignItems=CENTER)。\n图标列表: ${icons}`;
}

/** 脚本化调用配方:压缩工具往返次数与上下文占用 */
export function scriptRecipe(task?: string): string {
  const head =
    task == null
      ? '请按以下「脚本化」纪律调用 text-to-design 工具:'
      : `请用「脚本化」方式完成下面的任务:\n${task}\n\n执行要求:`;
  return `${head}
1) 多步流程一次成型:优先 jsd_batch 编排(create→reparent→update、find→批量修改、图标×N 等);宿主有代码执行工具时也可写一段脚本连续 await 多个 tools.jsd_*。
   ⚠ **同一轮里不要并发发多个 MCP 调用** —— 每次转发上限 \`UI_FORWARD_TIMEOUT_MS = 25s\`(\`shared/src/connection.ts\`),它从「UI 发出请求」起算;而插件侧是一条单线程 + 单文档:真正碰画布的那次引擎调用会占住线程,谁在排队,谁的 25s 计时照样在走,到点就被判成「插件响应超时」。实测(即时设计 2026-10-15):单发 8 次全部成功;同一轮并发发 ≥2 个调用时 3/3 出现超时。而**把并发收进 jsd_batch 的多个步骤(批内本来就是顺序执行)后,同一条查询 1.82s 就跑完了**(含进程启动,量法:\`text-to-design-mcp exec <calls.json> --json\`)⇒ 超时几乎总是**排队**,不是查询本身慢;先怀疑「我是不是并发发了」,而不是去拆查询。
   另一类是真的挂死(写入已落、回包永不返回,症状同样是 25s 超时,但重试无用):\`jsd_set_stroke\` 传 \`strokeStyleId\`、给**没有变体属性**的实例调 \`jsd_set_instance_properties\`、\`scope:"document"\` 触发的 \`loadAllPagesAsync\`(即时设计上它永不返回)。这类**别重试**,单独 \`jsd_find\` 回读一次确认是否已经落上(见第 8 条)。
2) 中间值只在管道内流动:上游结果用双花括号占位符(步骤id.字段路径)注入下游参数(脚本内用变量传递);每步只提取后续需要的字段,不回传完整序列化结果。**占位符只在同一次调用的本批次内有效** —— 跨批次引用会报「占位符引用的步骤不存在或未成功」并中止整批,跨批次请硬编码上一步回显里的真实 id。
3) 收敛:最后只做一次 jsd_get_selection(depth=1) 总复核,不要每步都复核。

## 整页/整档批量改造(同一套纪律的更重场合)

适用:一次要改的节点上百、参数体自己都写不下(整页铺 token、整档换样式、批量套组件)。只改几个节点时直接单工具调用更省。

4) **先摸底,再动手**。jsd_get_page 读 assets(组件/变体/样式/变量)与顶层节点;再**按「块」**(每屏 / 每板)分别 jsd_find(depth 2~3)把要改的树读回来。整档一次读完会超回包上限、结果落盘 —— 落盘后用脚本做结构化分析(分组、去重、统计形态),不要把整棵树塞进上下文。

5) **定策略前先确认「现状形态」**。例:批量绑色前先确认目标节点是不是「单个 SOLID 填充」——有渐变或多色的节点,一次绑整组会把该节点上别的 paint 一起改掉。这一步跳过,失败会以「回显成功但渲染变了」的形式出现(见结果 warnings 一节)。

6) **id 的三种来源,优先级从高到低**:本批步骤结果 {{步骤id.字段路径}};文档已有资源 {{@comp:名称}} / {{@var:名称}}(读一次 jsd_get_page 的资源清单,同批共用);兜底才硬编码上一批回显里的真实 id。名字零命中/多命中一律点名中止 —— 那是设计,不是可以「取最近的一个」的警告。

7) **按块切批**,不要一次排到 50 步上限:每屏一段既换来回显清晰,也换到失败隔离(某屏失败不连坐其余)。

8) **回读复核要单独调一次 jsd_find**。batch 回显会把节点裁到 id/name/type/几何,在批内看回显复核会被裁剪骗到;要确认 boundVariables 或 *StyleId 是否真落上,只能单独读一次。

9) **清单装不下就走文件,别把 id 搬进上下文**。jsd_batch 支持 callsFile(一个 JSON 文件的绝对路径,内容 {"calls":[…]} 或直接一个数组,可带 stopOnError / checkDrift);同一个文件也能用 CLI 直接跑 —— \`text-to-design-mcp exec <calls.json> [--json] [--dry-run]\`(dry-run 只校验清单;--json 把结果打成 JSON 供管道消费;任一步失败退出码为 1)。**不要**改去连 daemon 的本地端口或 import 本仓内部模块 —— 那是内部传输契约,不是给调用方用的接口。

10) **点名类错误不要重试**:字段不可绑 / 名字不唯一 / 平台签名不收 / 引用的步骤不存在,都是策略问题,重试只会同样失败。只有连接类抖动才值得重试。`;
}

/**
 * 设计策略总纲:把 server.ts 里 INSTRUCTIONS 的三条纪律展开成可照着走的完整流程。
 *
 * 复用只写在**第 0 条一处**(件类判据 + 平台入口 + 复用/新建纪律 + 深入指针),其余各条不
 * 再重复:此前它散在 0 / 3.5 / 8 三条里各讲一半,调用方读到任意一条都只拿到半张图。
 * 四条深入配方(variant-set / component-property / variable-binding / variant-sync)
 * 各留一行回指第 0 条 —— 件类选错时,后面那套动作做得再对也是白做。
 */
export function designStrategyRecipe(
  screen: string | undefined,
  platform: PlatformKey | null,
): string {
  const target = screen == null ? '当前设计' : `「${screen}」`;
  // 多状态组件那段按能力位分流,句子来自 platform-facts(与 combine_as_variants 的描述同源)
  const multiState = variantStrategyText(
    platform,
    platform == null ? null : claims(DOMAIN_CAPABILITY.variants),
  );
  // 复用入口按平台给(句子在 platform-facts,配方只拼接)
  const reuseGuide = reuseGuideText(platform);
  // 四类件之间的连线(三平台塌缩方式不同)—— 判据选对了仍接错就会白做,故紧跟入口
  const relations = resourceRelationText(
    platform,
    platform == null
      ? null
      : getPlatformState()?.capabilities.includes('styleEnumeration') === true,
  );
  // 排布的两条路(自动布局 / 栅格参考线)与逐平台可落性,同样只拼接不另写事实
  const layoutHint = layoutHintText(platform);
  return `# 画布创作纪律

0) **先查可复用件,再动手**(设计类任务的第一步,别跳)。\`jsd_get_page\`(等价资源 \`jsd://page\`)给的是**设计系统资源清单** —— 看 \`assets.summary\` 一眼判断这文档有没有现成的件,再按类取 id 复用;样式另有一份清单 \`jsd://styles\`(\`styleEnumeration\` 未声明的平台上它与 \`assets.styles\` 一样恒空,见下面「看不到」那条)。这一条里只有两件事:**选对件类** 与 **走对入口**。
   - **先判「要复用的是什么」,再选件类** —— 件类拿错,后面的动作全白做:
     - **整个结构**(按钮 / 卡片 / 列表项 / 图标底)→ **组件**。
     - **同一结构的几种状态**(默认 / 悬停 / 禁用 / 尺寸)→ **变体**:先看 \`assets.variants[].properties\` 有没有现成取值,有就切过去,没有才造(**造不造得出先看下面「多状态」那条** —— 平台未声明 inPlaceVariants 时根本没有变体集这条路)。
     - **一组固定视觉**(色 / 字号字重 / 阴影效果)→ **样式**。
     - **一个语义 token**(主色 / 间距 / 圆角,且要随模式或主题变)→ **变量**;本平台没有变量面就退回上一条的样式。
   - 复用入口(按当前平台):
${indentLines(reuseGuide, '     ')}
   - **它们之间怎么连(三平台的接法完全不同,别照搬别家)**:
${indentLines(relations, '     ')}
   - **命中就复用,禁止新建重复件**:同名/同用途的组件、已有的变体取值、已有的颜色/文字/效果样式、已有的变量,一律先用现成的;清单里确实没有才新建,并按「组件族/状态」命名 —— 命名是它下一次能被命中的唯一依据。反向也一样别做过头:只出现一次的结构不必提组件(提了也没有第二次可复用),一次性装饰不必建样式。
   - **清单是空的,先分清两种「看不到」** —— 判错就会白建一堆重复件:① **本平台读不出来**:样式与变量是能力门控面,平台未声明时 \`assets.styles\` / \`assets.variables\` **恒空**,回包 note 会点名「恒空:本平台未声明对应能力,这一面清单读不出来(不等于文档里没有)」;组件/变体集则可能因某页枚举失败而不全,note 里点名的是具体页名。别拿「看不到」当「没有」 —— 先用 \`jsd_find\` 按名字/类型再确认一遍;名字寻址(\`{{@comp:…}}\` / \`{{@var:…}}\`)读的是同一份清单,同样会不命中。② **确实没有** → 按下面从零建。
   - **从零建的落点顺序:先做样板 → 抄成件 → 再铺开**,别先铺十个同样的再回头提炼(那时每个都要改一遍):
     - 第一个单元做出来就立刻定型:**视觉类** \`jsd_create_style\` 从该节点抄出 PAINT / TEXT / EFFECT / GRID,后续节点直接引用 \`*StyleId\` —— **颜色与描边一律先落 PAINT 样式再上色,别在每个节点里各写一份 hex**(落地流程见第 10 条);**语义 token** 用本平台的建变量 op(名单见 platformOps),没有变量面的平台就落在样式上;**结构类**是否 \`jsd_create_component\` 提组件,按下一条的判据来 —— 不该抽的别抽。
     - 抽不抽的一句话判据:**结构完全一致 + 差异能收敛到变体属性 / 文本属性** → 抽,其余同类一律 \`jsd_create_instance\` 铺;**差异落在子节点上、或状态要靠多主件扛** → 不抽(理由见下面「复用不是无条件」那三条)。多状态:能合成变体集就合成,不能就多主件按「族 / 状态」命名。
     - **命名是它下一次能被命中的唯一依据**:按「族 / 状态」命名,不留「矩形 1」。
     - **建完回读**:再取一次资源清单,确认它真的进了 \`assets\`(看 \`summary\` 计数或名字)—— 没出现等于没建,下一次调用照样命中不了。⚠ 例外:**未声明 \`styleEnumeration\` 的平台**连样式都列不出来(当前三家都已声明 —— 即时设计自 2026-10-15 起也列得出,见 dec e1e66f0a;这条只在将来新平台或摘掉声明时才命中),建完在清单里永远看不到 —— 那就把 \`jsd_create_style\` 回包的 id **记账**(节点上的 \`*StyleId\` 也读得到),别指望回读清单。
   - **别拿 \`jsd_clone_node\` 当复用**:复制出来的是与主件脱钩的副本,改主件它不动。要「同结构多份」就铺实例。
   - **「复用」不是无条件的 —— 这三类件不抽组件**,抽了比不抽更难改:
     - **差异落在实例子节点上**的同类件(会话项的头像色 / 名字 / 预览 / 未读数、气泡的文案 / 宽度):实例子节点的样式覆盖**不保证渲染生效**,命中时引擎只回 warnings 让你去改主组件(见第 10 条)。内容各不相同的件抽成组件,等于把所有差异押在不保证生效的覆盖上 —— 主组件全继承不可能(内容各不相同),到处覆盖又不生效,抽完更难改。
     - **状态变体在没声明 inPlaceVariants 的平台上**(即时设计,以 ping 能力位为准):变体集做不出来,只能退化成多主件按「族名 / 状态」命名(标签 / 选中、标签 / 默认)—— 而**多主件不省事**,改一处要改 N 个主件。只有视觉差异的状态,优先用样式或填充差异表达,别克隆出一整套多主件。也别指望 \`jsd_set_instance_properties\` 在没有变体集的实例上「切状态」—— 真机(即时设计 2026-10-14):给无变体属性的实例设属性**不报错,直接挂到 25s 转发超时**。另:合成失败**不是无副作用**,画布会留下畸形集合与布尔运算残骸,按名字 \`jsd_find\` 出来用 \`jsd_repair_nodes\` 清(\`jsd_delete_node\` 对它们报「没有要删除的节点」)。
     - **往返预算压不住时**:组件化的顺序与「一次 batch 成型」**相反**(先建主件 → 铺实例 → 再逐个回写实例差异),且占位符 \`{{步骤id.字段路径}}\` **只在本批次内有效** —— 差异写在实例子节点上时,子节点 id 要等铺完才知道,必然跨批,跨批就得把真实 id 硬编码记账,往返数翻倍。**一次性 / 低复用预期的画面选少往返是正当的**,别为了纪律把简单画面做成三趟往返。
   - **不抽组件,可维护性靠这三样补**(别裸奔):① **视觉统一走样式** —— 这是不组件化时唯一真能「改一处影响全部」的路(jsDesign 有样式面:\`jsd_create_style\` 从样板节点抄一条,其余节点引用 \`*StyleId\`;它**没有变量面**,色板与间距也落在样式上);② **语义化命名当查询键** —— 同类件要一起改时 \`jsd_find\` 按名字/类型一次拎出来,再 \`jsd_batch\` 改(命名乱了这招就废);③ **状态差异一律「族名 / 状态」命名**,将来整族可定位。
   - **改动一处要影响全部 → 改源头**:改主组件 / 改样式 / 改变量,不要逐个改实例;要把一套覆盖从源实例复制到一批目标走 \`jsd_sync_overrides\`(配方 \`jsd://recipes/variant-sync\`)。
   - 多状态组件怎么造:${multiState}
   - 深入(总纲只给判据,细节在各自的配方):**造变体集** \`jsd://recipes/variant-set\`;**组件属性(布尔 / 文本 / 换绑)的定义与设值** \`jsd://recipes/component-property\`;**变量绑定与批量套用** \`jsd://recipes/variable-binding\`。
1) 再摸底:jsd_get_selection(depth=2) 看现状(名称/类型/尺寸/填充/子结构),已有节点用 jsd_find 精确定位,不要重复创建同名元素。
2) 结构分层,调用分批:**成品该多深就多深** —— 屏 → 语义分区 → 卡片 → 卡内图元,四层都要建出来,别只做到「屏 + 分区」就收手。受限的只是**单次调用的传参方式**:children 只用于「容器 + 其直属子节点」这类小结构,别在一次 create 里塞整棵树(易整批失败);分层分批用 jsd_batch 编排多个 per-type create 步骤,每批建完即用 jsd_reparent_nodes 归到父容器。
   - **慢的主因是往返数,不是单次调用慢**。整屏几十次串行调用里,一半是「建一个 → 挂一个 → 回读一次」这种能被合并的账。按**「骨架批 → 内容批 → 图标批 → 验收」四批收口**:
     - 建与挂**同批**:父级 id 用同批占位符 \`{{建屏步骤.created[0].id}}\` 传给下游 reparent —— 占位符只在本批次内有效,分两批就只能硬编码上批回显的 id。
     - \`jsd_batch\` 单批 **50 步上限**;图标每颗要「建 + 改色 + 归位」三步,一屏十几个图标很快撞线,按 40~48 切批。
     - **探测也成批**:要摸色板就一次 batch 建 N 个样板矩形、再一次 \`jsd_find\` 回读 \`fills\`(\`fillStyleId\` 回读里带实际 color);别一色一次往返。
     - **验收只做一次**:整屏一次 \`jsd_export\` 目检 + 一次 \`jsd_find depth:8\` 扫「TEXT width 过小 / characters 为空」,别每步导图。
     - **首屏尺寸先估再建**:按 812(或目标高度)把分区高度加一遍,超了就先压缩再落笔 —— 溢出后整套拆掉重建是这类任务最大的单笔浪费。
3) 命名语义化:用「登录页 / Logo 容器 / 邮箱输入 / 主按钮」这类说明用途的名字,不用「矩形 1」「Frame 2」;同一批元素命名风格保持一致。
4) 归组后再布局:**元素不许直挂屏根** —— 屏内每个语义分区(侧栏 / 顶栏 / 筛选条 / KPI 行 / 每张卡片)各自是一个容器,卡片内部的图元再按语义编组(GROUP:坐标轴 / 网格 / 数据系列 / 图例各一组)。一层不套、几十个元素平铺是后续最难改的形态,别走这个极端。做法:先建容器与元素,再用 jsd_reparent_nodes 逐层归入(**parentId 显式传目标容器 id**,别依赖「当前选中第一个」的缺省值;跨父级移动会保持节点绝对位置,不用手动摆回 x/y,移入 auto-layout 容器时位置交给布局);auto-layout(layoutMode/itemSpacing/padding*/primaryAxisAlignItems 等)最后用 jsd_set_layout 单独设,别在建节点时混着传;**但 sizingMode 是例外** —— 开布局那一刻引擎会按内容重算容器尺寸,**写路径随后按「该轴 sizingMode 的回读值」把声明了 \`FIXED\` 的轴自动钉回**开布局前的尺寸(并在 warnings 里点名「已按声明钉回」、回显尺寸同步为真值);回读 AUTO 的轴**保留 hug**,不钉回。
   - **高度:除非是最外层节点容器,一律走自动高度**(这是写路径的默认推断,2026-10-20 起):内层分区只声明 \`width\`,**不传 height** —— 传了也会被推断成 \`counterAxisSizingMode=AUTO\`(纵向容器)按内容撑开,warnings 会点名「高度默认自动」。理由:分区高度写死,中文换行 / 文案增删都会直接裁切,而且整屏高度很容易加成超 812 —— 溢出后只能整套拆掉重建。
   - **只有屏根(直挂页面的那个容器)把两轴都钉 FIXED**:它承载画板尺寸,按内容 hug 会塌成内容高度。
   - **宽度一律 FIXED**(行 / 卡片要撑满父宽,按内容 hug 会缩成内容宽)。
   - 确实要固定某个内层容器的高度:显式传该轴 \`sizingMode:"FIXED"\` + \`height\`,再说一次 \`jsd_resize_node\` 钉回去。
   - ⇒ 一句话:**内层只给宽度、高度交给内容;屏根才写死高度。**(逐平台实测见第 5 条。)
   - **auto-layout 不是可选项,是屏内分区的默认解**(完整机制见配方 \`jsd://recipes/auto-layout\`)。判据:同类子项 + 沿一条轴 + 间距一致 → 一律上布局。屏内这几处**最容易漏**,而它们恰好是间距唯一靠手调坐标凑的地方:标签栏 / 分段控件(等分,每项 \`layoutGrow:1\`)、胶囊组 / 参数行 / 筛选条(\`itemSpacing\`)、卡片头(左标题 + 右操作,\`SPACE_BETWEEN\`)、列表行 / 表单行(**每行一个独立行 FRAME**)、整屏分区(内容区 \`layoutGrow:1\` 吃满剩余高度)。
   - **方向每个容器自判**: \`layoutMode\` = 直属子项流动轴(X→HORIZONTAL, Y→VERTICAL),配方不写死哪张形态用哪个值(见 \`jsd://recipes/auto-layout\`)。禁止把父级方向抄到子级;垂直居中走交叉轴对齐,不是 VERTICAL。
   - **行内图元先归组,再进布局** —— 行内「图标 + 标题 + 值 + 箭头」若平铺进外层,开布局会按**外层那条轴**把它们排成一串。要成一行一项,先给每行建一层行 FRAME。
   - **正当的例外只有三条**:异质叠放(卡片头那种各在不同 x/y、视觉上不成等距序列的组合)、一次性装饰(光晕 / 渐隐遮罩 / 装饰线)、要「布局内绝对定位」的浮层(本平台没有 \`layoutPositioning\`,改用 z 序 + 绝对坐标)。
   - **自检一句话**:加固完后每个分区都应能说出「它的间距是哪条 \`itemSpacing\`」。说不出、只能报坐标的,就是欠账 —— 欠账不会报错,只会在下一次要改间距时全部暴露。
5) ${layoutHint}
6) **绘图区用 SVG 还是原生图元,按「之后要改的是哪一类」分**(做法见 \`jsd://recipes/chart-by-code\`):**数值级**(换数据 / 改某根柱的高度 / 挪一个点)→ SVG,回源重算重导比在画布上挪一串节点便宜;\`vectorPaths.data\` **不回读**,画布上读不到也改不了坐标。**样式级**(改色 / 线宽 / 隐藏某个系列)→ 两边都行:SVG 按语义 \`<g id>\` 切层后在画布上就能点名改(实测 jsDesign 会落成同名子分组,渐变与 dash 保留;换平台先回读确认)。**结构级**(要排进 auto-layout 行列 / 要绑变量或样式 / 要做成组件复用 / 表格单元格 / 卡片骨架)→ 必须原生节点,**SVG 不吃布局**。**文案一律原生**(SVG 里的 \`<text>\` 字体字重由引擎解析,不保证)。三者常共存,一张卡的标准形态:卡片 FRAME + 标题/图例/数值/表格用原生节点,中间绘图区塞一个 SVG 子节点。
7) 间距与字号阶梯:主标题 > 正文标签 > 按钮文本 > 辅助说明;同级元素间距一致,用 itemSpacing 统一控制,不靠手调坐标凑。**长段落要换行**:TEXT 缺省按内容撑开(textAutoResize 缺省 WIDTH_AND_HEIGHT),只给 width 会被引擎改成 NONE 且高度不随内容重算 —— 要固定宽+自动换行传 width + textAutoResize:"HEIGHT",要固定框尺寸传 "NONE";高度没跟着内容走时**重设一次 characters 就触发重排**,别急着改尺寸。**字体取 jsd_list_fonts 的 fonts[] 成对值**:family 用 fonts[].family 原样(如 SourceHanSansCN_family),style 用同一项的全名(如 SourceHanSansCN-Bold,不是简称 "Bold")—— 写错会被静默忽略、退回默认字面,结果 warnings 会点名。
8) 视觉顺序:自上而下按阅读顺序排布,主操作按钮放在输入项之后,次要链接(忘记密码/注册)放最后。
9) 层序与遮挡:序列化里每个节点都带 \`z\`(= 父级 children 下标 = 绘制顺序,0 = 最底层,越大越靠上),判断谁压谁直接读 z。要调层序用 jsd_reparent_nodes + index(= 目标 z);auto-layout 容器同样支持,若引擎没落位会明确报错,那就改 itemSpacing / 对齐。别靠「新建一个节点压上去」改遮挡。
10) 样式落点:**颜色与描边必须走样式,不内联**。流程是「**先归一化** → 建样式 → 引用」:① 同类视觉先收敛成**一套值** —— 同名用途却差一两度的色(分割线 / 侧栏边框 / 卡片描边各写一个 hex 是常见病)不收就建,样式只套得住一半节点、后续改色仍要逐个补;② \`jsd_create_style({kind:"PAINT", name:"色板/主色", fromNodeId:样板节点})\` 从样板抄(jsDesign 只收 PAINT / TEXT / EFFECT / GRID 四类);③ 引用走 \`fillStyleId\` / \`strokeStyleId\` —— **创建入参顶层就收这两个键**,建节点时一趟带上,不必「建完再绑」;④ **文字颜色直接放进 \`jsd_set_text\` 的 \`fills\`**(与排版同一趟写入;要批量刷色或绑 \`fillStyleId\` 时仍走 \`jsd_set_fill_color\`);⑤ 样式**清单读不回的平台(即时设计)必须把 \`jsd_create_style\` 回包的 id 记账**,丢了找不回。其余:纯描边图形只传 strokes 就行(fills 会被自动置空,不会变灰块);批量刷色给 ids + recursive(recursive 只作用于后代,容器自己不会被套上方框,要给容器也上色才传 includeSelf=true);实例子节点(位于 INSTANCE 内)的样式覆盖不保证渲染生效 —— 命中时结果的 warnings 会直接给出主组件里对应子节点的 id,改主组件即所有实例继承,只要单实例不同就先 jsd_detach_instance。
11) 批量回显都做了摘要裁剪(jsd_batch 的节点只留 id/name/type/x/y):含图标/矢量克隆的批次要另配一次 jsd_export 目视验收,别拿回显当验收证据。
12) 出错回滚:ok=false 或「没找到 X 节点」→ jsd_find 复核 id 是否已失效(可能被连坐删除),必要时 jsd_repair_nodes 清理后重试。**结果 warnings 一律读** —— 它点名的都是「回显成功却没生效」:能力门控字段被忽略、字段回读不一致(fontName 字重被降级 / TEXT 的 width 被 auto-resize 吃掉)、根节点 x/y 被 placement 覆盖;含删除/移父的批次还会报同层几何漂移(引擎把没碰到的兄弟节点静默挪走),照 warnings 给的原值回填,别把它当样式问题排查。
13) 收敛复核:整批做完只做一次 jsd_get_selection(depth=1),或 jsd_export({ids:[要看的节点id], scale:0.5}) 导小图看效果(ids 为必填数组);**关键视觉改动靠导图目检,回显不等于生效**,不要每步都读一遍。

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

/**
 * 自动布局配方。
 *
 * 与 `design-strategy` 第 4 条的分工:那边只给**判据**(该不该上、哪类容器最容易漏),
 * 这边给**机制**(方向自判、两条落地路径、执行顺序、验收与坑)。不写死某形态的
 * HORIZONTAL/VERTICAL —— 实测模型会把「外层 VERTICAL」抄到行 FRAME 上。
 * 平台事实不在本文件重写 —— 复用 `layoutHintText`,与工具描述、第 5 条同源。
 */
export function autoLayoutRecipe(
  target: string | undefined,
  platform: PlatformKey | null,
): string {
  const where = target == null ? '目标分区' : `「${target}」`;
  return `# 自动布局(auto-layout)

**结论先行:同类子项沿一条轴排的容器,一律上 auto-layout。** 用绝对坐标钉同类子项是**欠账**,不是「先这样,以后再改」—— 间距散在 N 个节点上,改一次要改 N 遍,中间插一项要挪后面全部;而漏掉的那些容器,恰恰是间距唯一靠手调坐标凑的地方。

## 0) 先判:该不该上

**该上**(同类子项 + 沿一条轴 + 间距一致)—— 屏内这几处最容易漏,漏了间距只能手调坐标。表只标「要上布局 + 常用字段」,**不指定 HORIZONTAL/VERTICAL**。

| 形态 | 为什么容易漏 | 常用字段(方向另判) |
| --- | --- | --- |
| 标签栏 / 分段控件 | 等分靠手调宽度 | 每项 \`layoutGrow:1\`,itemSpacing 0 |
| 胶囊组 / 参数行 / 筛选 chip | 等距靠手调 x | \`itemSpacing\` |
| 卡片头(标题与操作分两端) | 两端拉开靠绝对坐标 | \`primaryAxisAlignItems:"SPACE_BETWEEN"\`(作用在主轴;此时 itemSpacing 被忽略) |
| 列表 / 表单 | 行距靠手调 y;行内图元平铺 | **每行一个独立行 FRAME**;行内交叉轴居中用 \`counterAxisAlignItems:"CENTER"\` |
| 整屏分区(状态栏 / 头部 / 内容 / 底栏) | 区间距靠手调 y | 吃剩余空间的那块 \`layoutGrow:1\` |
| 需要子项撑满交叉轴 | — | 子项 \`layoutAlign:"STRETCH"\` |

**方向每个容器自己判。** \`layoutMode\` = 该容器**直属子项**的流动轴,不是容器外形,不是对齐方向:
- 子项意图沿 X 递增(左→右) → HORIZONTAL
- 子项意图沿 Y 递增(上→下) → VERTICAL
- 「垂直居中」≠ VERTICAL:那是交叉轴对齐。行里要竖向居中 → HORIZONTAL + \`counterAxisAlignItems:"CENTER"\`
- **禁止把父级方向复制到子级**:侧栏整体可以竖排,头部「左 Logo + 右折叠」仍按头部自己的子项流动轴判

**不该上** —— 三条正当的例外,别硬套:
- **异质叠放**:卡片头那种「头像 + 标题 + 副标题」各在不同 x/y、视觉上不是一条轴上的等距序列 → 容器 + 绝对坐标(要跟着伸缩再补 \`constraints\`)。
- **一次性装饰**:光晕、渐变遮罩、装饰线 —— 没有第二次复用,也没有间距语义。
- **要「布局内绝对定位」的浮层**:本平台没有 \`layoutPositioning\`,做不到 —— 改用 z 序 + 绝对坐标。

**最容易漏的一条**:行内图元没归组。列表 / 表单的「图标 + 标题 + 值 + 箭头」若平铺进外层,开布局会按**外层那条轴**把它们排成一串 —— 要成「一行一项」,必须先给每行建一层行 FRAME,再让行 FRAME 进外层。

## 1) 两条落地路径,别混着走

**路径 A —— 建容器那一次就带布局(推荐)**
\`jsd_create_frame\` 同一次入参里给全:\`layoutMode\` + \`itemSpacing\` + \`padding*\` + \`primary|counterAxisAlignItems\`,尺寸只给**宽度**。
⇒ **高度交给自动高度**:内层容器不传 height 时会被推断成该轴 \`sizingMode=AUTO\`(按内容撑开),这是默认意图 —— 分区里文案换行、增删内容都不会裁切。只有**最外层节点容器(屏根)**要同时给 width/height(两轴 FIXED,画板尺寸不能塌)。
⇒ 真要固定某个内层容器的高度:显式传该轴 \`sizingMode:"FIXED"\` + \`height\`。**别在 children 里给每个分区都写 height** —— 整屏高度极易加成超 812,超了只能整套拆掉重建。子节点的 x/y 交给布局,**建子节点时不必写 x/y**(写了也被覆盖)。

**路径 B —— 事后给已有容器开布局**
\`jsd_set_layout\` → **立刻** \`jsd_resize_node\` 钉回原尺寸 → **不要再重发** \`jsd_set_layout\`(重发会再吃掉一次)。
为什么必须钉:开布局会按内容重算容器尺寸,两个 \`sizingMode\` 即便**同时传 FIXED 也保不住**(实测数字与成因见第 3 节)。要的就是按内容撑开,则显式传 \`AUTO\`,让意图与结果一致。

⚠ 两条路径的**前提都是结构已就位**:先 reparent 归组、排好顺序,再开布局。反过来做(先开布局,再逐个 reparent)每次 reparent 都触发一次回流,往返也多。

## 2) 执行顺序(照抄)

1) 建容器(**不带布局**)+ 建子项,先按绝对坐标摆到大致位置 —— 这一步只为「看得见」;
2) \`jsd_reparent_nodes\` 逐层归入(**parentId 显式传**);
3) 开布局:路径 A 的容器跳过本步;路径 B 在这里 \`jsd_set_layout\`;
4) 路径 B 补 \`jsd_resize_node\` 钉回尺寸;
5) 单独 \`jsd_find { ids:[容器id], depth:1 }\` 回读:容器尺寸对不对、子项 x/y 是否已被布局接管(变成 itemSpacing 递推值,而不是原来手摆的坐标);
6) 关键分区另配一次 \`jsd_export\` 目检 —— **回显不等于生效**。

## 3) 本平台可落性

${layoutHintText(platform)}

## 4) 验收判据(四条,缺一条就是没落上)

- **屏根**尺寸 = 设计稿标称值(375×812 之类),**不是** hug 后的内容尺寸;
- 子项间距 = itemSpacing 的递推值,**不是**原来手摆的坐标;
- warnings 里**没有**「尺寸被 auto-layout 改成 X(开布局前 Y)」;
- 导图目检:纯加布局语义时应当**零视觉变化** —— 一旦有位移/裁切,说明原坐标与布局参数不等价(常见:padding 与手摆的边距对不上、交叉轴对齐方向反了)。

## 5) 常见坑

- **文本的两条前置**:进布局前先定 \`textAutoResize\`(固定宽 + 自动高传 \`"HEIGHT"\`,固定框传 \`"NONE"\`),且**建 TEXT 时一次给全 characters + width/height**。漏了前者:「只给 width → 引擎改成 NONE → 高度不随内容重算」,重设一次 characters 才触发重排,别急着改尺寸。漏了后者更狠:宽度被钉到 1px,回读 characters 完整、零告警、**画面空白** —— 修法是 \`jsd_resize_node\` 传 width 钉回去。两条的实测细节都在第 3 节。
- **手摆的坐标在布局里不显形**:布局容器接管子节点 x/y —— 要调排布就改 \`itemSpacing\` / 对齐 / \`layoutGrow\`,不是改 x/y。
- **Figma 专有的布局字段本平台没有**(换行 \`layoutWrap\`、布局内绝对定位 \`layoutPositioning\`、\`counterAxisSpacing\` 等)—— 别按 Figma 习惯试,名单见第 3 节。
- **\`layoutGrids\` 与 auto-layout 互斥**:引擎只在**非自动布局**的容器上收网格。
- **\`jsd_set_layout\` 不改尺寸**:它只管布局语义;改宽高走 \`jsd_resize_node\`。
- **\`layoutMode\` 不是容器外形,也不是对齐**:侧栏/整屏「看起来是竖的」不等于每个子容器都 VERTICAL;「垂直居中」走 \`counterAxisAlignItems:"CENTER"\`。写错方向的典型画面:行里的图标/标题/时间被竖着摞、挤出行高。
- **移父会改写被移节点自己的布局属性(代码已压回)**:引擎把节点插进 auto-layout 父级时,会把子节点方向改成父级那套、两轴对齐对调。\`jsd_reparent_nodes\` 现在移前快照、移后压回,压不住才在 warnings 点名 —— **别自己再补一次 set_layout**:它是整体语义,分两次发第二次会把第一次的丢掉。parentId 指向非容器(如 RECTANGLE)现在动手前就报错并给出替代形状,不用等引擎那句 \`not a function\`。

## 6) 加固后的复核清单

- [ ] 标签栏 / 分段控件上了布局;等分用 \`layoutGrow:1\`
- [ ] 胶囊组 / 参数行上了布局;间距走 itemSpacing
- [ ] 卡片头上了布局;两端拉开走 SPACE_BETWEEN
- [ ] 列表 / 设置:**每行一个独立行 FRAME**,行内图元不进外层
- [ ] 整屏分区上了布局;吃剩余空间的那块 \`layoutGrow:1\`
- [ ] 每个容器的 layoutMode 对应该容器直属子项的流动轴(X→HORIZONTAL, Y→VERTICAL);没把父级方向抄到子级
- [ ] 没把「垂直居中」写成 layoutMode:VERTICAL
- [ ] 每个分区都能说出它的间距是哪条 \`itemSpacing\`;靠手调坐标凑的就是欠账

${where}按这条走;判据(该不该上、哪类容器最容易漏)见 \`jsd://recipes/design-strategy\` 第 4 条。`;
}

/** 文本批量替换策略:安全副本 + 语义分块 + 逐块复核,避免一次性全改后无法回退 */
export function textReplaceRecipe(rootId?: string): string {
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
export function variantSyncRecipe(
  sourceId?: string,
  targetType?: string,
): string {
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
「要复用的东西该走组件 / 变体 / 样式 / 变量哪一类」是另一道题,判据在 \`jsd://recipes/design-strategy\` 第 0 条;本配方只管「同一批实例怎么统一」。

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
export function variableBindingRecipe(
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
${variableBindBulkText(platform)}
- 整条链(建变量 → 绑定 → 回读复核)合并进 jsd_batch:本批新建的中间 id 用 {{步骤id.字段路径}} 占位符(不回传模型),**已存在的组件 / 变量按名字取**用 {{@comp:名称}} / {{@var:名称}} —— 它读一次 jsd_get_page 的资源清单,省掉「先查 id 再拼批」那一趟往返;名字不唯一或没命中都会点名中止。
- ⚠ 名字一律按 assets 里**原样**写,不要照搬创建时用的路径:即时设计会把带斜杠的组件名拆成「集合 / 成分」,assets.components[].name 存的是叶子名(真机 2026-10-14:建「探针/组件」之后清单里叫「组件」,而「探针」落在 assets.variants 的集合名上)—— 按创建时那个路径写会不命中,没命中时错误里会给出现有名字。
- ⚠ 可建 / 可绑的变量类型:Figma 是 VariableResolvedDataType 六种(BOOLEAN / COLOR / EASING / FLOAT / STRING / TIMING),MG 是那 12 项(单值 STRING / BOOLEAN / COLOR / NUMBER + 复合样式 PAINT / TEXT / EFFECT / GRID / STROKE_WIDTH / CORNER_RADIUS / PADDING / SPACING)—— **两家都没有 VARIANT 类型** —— 「把变体属性绑到变量」在这两个平台上都不存在,别去试;切变体取值走 jsd_set_instance_properties。另两条容易混成一件事的:Figma 能把**组件属性值**(BOOLEAN / TEXT / INSTANCE_SWAP)绑变量,properties 的值传 {type, value:{type:'VARIABLE_ALIAS', id}};而「一个变量的值引用另一个变量」是**值形态**(把 {type:'VARIABLE_ALIAS', id} 作为 value 传给 figma_variables_create),不是第五种可建类型 —— EXPRESSION 与 VARIABLE_ALIAS 只出现在原型交互的 VariableData 表里,createVariable 的第三参收不了它们。
- ⚠ MG 那八项**复合样式类型建出来就是一条样式**(它自己带 paints / 排版子项),所以它只进 \`assets.variables\`、**不进** \`assets.styles\`;而 MG 的样式与变量**共用一套 id 空间且类别词汇重名** —— 删除时分入口:变量走 \`mg_variables_remove\`,样式走 \`jsd_delete_style\`,拿样式入口删变量会回包成功、变量真没了(真机 2026-10-14)。Figma 反过来:样式是**独立资源**,变量可以绑进样式里(改一次,所有引用该样式的节点都跟)—— 写用 \`figma_style_variables_apply\`、回读用 \`figma_style_variables_list\`,**词汇与节点档不同**:样式上那份填充叫 paints(不是 fills / strokes)、子字段固定 color,排版档(fontSize / lineHeight / …)只有 TEXT 样式能绑;要「这一个节点的某个字段跟变量」仍走 \`figma_variables_apply\`,两档别混。

## 4. 复核(写后必须回读)
${variableBindVerifyText(platform)}
- 结果的 warnings 一律读:绑定类字段被忽略时会在这里点名。`
    : `## 3. 本平台没有可用的变量入口,本节跳过
- 别去试变量 op(daemon 会拦成 platform_unsupported,白跑一趟往返)。
- 统一色板 / 间距照第 1 节末尾的替代路径做(那半句就是从事实表 \`variables.fallback\` 投影出来的,不在这里重写);要批量复用样式走 variant-sync 配方(COMPONENT + jsd_sync_overrides)。

## 4. 复核
- 若文档里本来就有绑定(别的平台建的),回读时按字段名比对;本平台读不到绑定字段时,结果里不会出现该键,别把「没有该键」当成「绑定丢了」。`;
  const existsLine = hasWrite
    ? variableBindShapeText(platform)
    : '- 本平台的读侧也不提供绑定字段,所以下面讲的字段形状只在有变量面的平台上成立 —— 看一眼知道有这回事即可,别在本平台找它。';
  return `# 变量绑定与批量套用(${scope})

## 1. 本平台的变量面
- ${face}
- 先确认这道题**该由变量来答**:只要一组固定视觉就够(不随模式/主题变)时走样式更轻,判据见 \`jsd://recipes/design-strategy\` 第 0 条。

## 2. 摸清现状再动手
${existsLine}

${howto}`;
}

/** 变体集构建:分流依据是能力位,兜底写法取自事实表 */
export function variantSetRecipe(
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
- 先确认这道题**该由变体来答**:只是几处颜色/字号不同 → 样式;只是同一结构的几种状态 → 才是变体(判据见 \`jsd://recipes/design-strategy\` 第 0 条)。
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
export function componentPropertyRecipe(
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
      ? '- 需要显式类型或换绑候选时传 {"type":"INSTANCE_SWAP","value":"1:2"};\n- 要让**组件属性的值跟随变量**(BOOLEAN / TEXT / INSTANCE_SWAP 三类)时,value 传 {"type":"VARIABLE_ALIAS","id":"VariableID:23:114"} —— 这是 Figma `setProperties` 签名里的一档(plugin-api.d.ts:11123),id 取自 figma_variables_list 或 {{@var:名称}}。⚠ **变体属性(VARIANT)不能这样绑**:变量类型表里没有 VARIANT,变体取值只能给字符串。'
      : '- 换绑属性(INSTANCE_SWAP):本平台签名收**字符串**,所以直接传组件 id/键就行;**对象形态**({"type":"INSTANCE_SWAP",...})只有能收变量别名的签名才认(见上一节)。要整组件换绑用 jsd_swap_component。',
    '- 值形态以本平台 `setProperties` 签名为准(见上一节),不在签名里的形态不是「会被忽略」而是「本就没这个入口」。',
  ].join('\n');
  return `# 组件属性的定义与设值(${scope})

## 1. 分清两件事(混起来是最常见的错)
- 属性是**组件 / 变体**这一层的事:整块结构复用走组件、状态差异走变体、纯视觉走样式 —— 三类件怎么选见 \`jsd://recipes/design-strategy\` 第 0 条。
- **定义**:在 COMPONENT / COMPONENT_SET 上建属性。入口是平台 op,名单先经 jsd_ping 的 platformOps 确认(不同平台各自一套,没有统一入口)。
- **设值**:在 INSTANCE 上给值,三平台同名入口 \`jsd_set_instance_properties\`(不在组件本体上设值)。

## 2. 本平台的事实${platform == null ? '(未探测到平台 —— 下面按平台分别列出)' : `(${PLATFORM_LABEL[platform]})`}
- ${write}

## 3. 值怎么传
${valueHint}

## 4. 读属性名与可选值
- 先 jsd_find / jsd_get_selection 读:取值读 \`variantProperties\`,组件属性读 \`componentProperties\`(读不到的平台上只有前者);
- 可选值读**组件集**上的 \`variantGroupProperties\`(属性名 → 可选值集合);
- **变体属性传名字**(如 \`{"状态":"禁用"}\`);**组件属性(布尔/文本/换绑)传带 \`#\` 后缀的完整键**(如 \`标题#32:0\`)—— 组件属性在引擎侧只认完整键,短名会报 \`Could not find a component property with name\`(Figma 真机实测,TEXT/BOOLEAN/INSTANCE_SWAP 三类都一样;免后缀只对**变体属性**成立,那是另一张表)。传短名时 core 只在基名**唯一**命中时替你补全,有歧义直接报错并列出候选 —— 别指望它猜;
- **选键之前先读 \`componentPropertyReferences\`**:它标明「**哪个图层由哪个属性驱动**」,这是判断该写哪个键的唯一一手事实(见第 6 节)。

## 5. 批量设值
- jsd_set_instance_properties 的 ids 一次传多个同类实例;要把整套覆盖从源实例复制到一批目标用 jsd_sync_overrides;
- 多实例 + 多属性合并进 jsd_batch,中间 id 用占位符,不回传模型。

## 6. 复核
- 回读 componentProperties / variantProperties 的 value 与期望比对 —— 写后回读才算验收;
- ⚠ **回读通过 ≠ 画面变了**:属性可能成对存在(\`摘要\`/\`摘要2\`、\`显示铃铛\`/\`显示铃铛2\`),只有**连着可见图层**的那一组会改画面 —— 写错那组时\`componentProperties\` 全部回读为新值、回包 \`ok=true\`,画布却纹丝不动(Figma 真机实测)。所以第 4 节要先读 \`componentPropertyReferences\` 认准连着可见层的是哪一组,写完再用 jsd_find **深度读节点的实际内容 / 可见性**复核,别只看 \`componentProperties\` 的回显;
- 实例子节点(INSTANCE 内)的样式覆盖不保证渲染生效:命中时结果 warnings 会给出主组件里对应子节点的 id,改主组件即全实例继承;
- warnings 一律读:被忽略的字段、回读不一致(fontName 字重降级等)都在那里点名。`;
}

/**
 * 示例脚本(单系列折线):**零依赖、刻意用字符串拼接**。
 *
 * 不用模板串:模型照着写时,模板串里的 `${}` 会被宿主 shell / 编辑器再插值一轮,
 * 是最常见的一类翻车。不引任何图形库:配方不指定库(0036 的变更历史),
 * 示例必须证明「原生 Math + 数组方法」就够画一张图。
 *
 * 分层写进示例而不是只写在正文里(配方第 5 节):模型照抄示例的概率远高于照抄散文,
 * 而「按语义层切 `<g id>`」这件事只有落在示例里才看得见。
 */
const CHART_CODE_EXAMPLE = [
  '// /tmp/chart.mjs —— 跑:node /tmp/chart.mjs',
  "import { writeFileSync } from 'node:fs';",
  '',
  'const data = [12, 18, 15, 26, 31, 28, 36];',
  "const labels = ['一','二','三','四','五','六','日'];",
  'const W = 640, H = 360, PAD = 24, YW = 44, XH = 20, TITLE = 22, GAP = 16;',
  'const px = PAD + YW, py = PAD + TITLE + GAP;        // 绘图区原点',
  'const pw = W - PAD - px, ph = H - PAD - XH - py;    // 绘图区尺寸',
  'const half = pw / data.length / 2;',
  '',
  '// 比例自己算:值域 → 像素区间,就这两行',
  'const x = (i) => half + ((pw - half * 2) * i) / (data.length - 1);',
  'const y = (v) => ph - (ph * v) / Math.max(...data);',
  '',
  '// 折线:M 起点,其余逐段 L',
  'const d = data',
  "  .map((v, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(v).toFixed(1))",
  "  .join(' ');",
  '',
  'const parts = [];',
  "parts.push('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"' + W + '\" height=\"' + H + '\" viewBox=\"0 0 ' + W + ' ' + H + '\">');",
  '// 一个语义层一个 <g id>:导入后对得上,手改只进这一层(见第 5 节)',
  'parts.push(\'<g id="title">\');',
  'parts.push(\'<text x="\' + PAD + \'" y="\' + (PAD + 16) + \'" font-family="-apple-system, PingFang SC, sans-serif" font-size="16" fill="#111827">周活跃</text>\');',
  "parts.push('</g>');",
  '// 绘图区的 translate 只在最外层这一处,层内坐标从 0 起 —— 挪图只改这一个数',
  "parts.push('<g id=\"plot\" transform=\"translate(' + px + ',' + py + ')\">');",
  'parts.push(\'<g id="axis">\');',
  'parts.push(\'<rect x="0" y="\' + (ph - 1) + \'" width="\' + pw + \'" height="1" fill="#D1D5DB"/>\');',
  "parts.push('</g>');",
  'parts.push(\'<g id="series-active">\');',
  'parts.push(\'<path d="\' + d + \'" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linejoin="round"/>\');',
  'for (const [i, v] of data.entries()) {',
  '  parts.push(\'<circle cx="\' + x(i).toFixed(1) + \'" cy="\' + y(v).toFixed(1) + \'" r="3" fill="#3B82F6"/>\');',
  '}',
  "parts.push('</g>');",
  'parts.push(\'<g id="axis-labels">\');',
  'for (const [i, t] of labels.entries()) {',
  '  parts.push(\'<text x="\' + x(i).toFixed(1) + \'" y="\' + (ph + 14) + \'" font-size="11" fill="#6B7280" text-anchor="middle" font-family="-apple-system, sans-serif">\' + t + \'</text>\');',
  '}',
  "parts.push('</g>');",
  "parts.push('</g></svg>');",
  '',
  "const svg = parts.join('');",
  "writeFileSync('/tmp/chart.svg', svg);",
  "console.log('bytes', Buffer.byteLength(svg));",
].join('\n');

/**
 * 图表配方:自己写代码算几何 → 落盘 SVG → 走 `jsd_create_svg` 导入。
 *
 * **这是画图的唯一路径**(0036 起删掉了内置 `jsd_create_chart` 编译器):本仓不枚举
 * 种类、不引任何图形库、也不执行调用方给的代码 —— 几何在调用方自己的执行环境里算。
 * 刻意**不点名库**:指名就把模型绑到某一个包上,而能跑出字符串的写法有无穷多种。
 * 配色与字号**取自画布上已有的样式/变量**(读 \`jsd://styles\` 与 \`boundVariables\`),
 * 本仓不再维护一套自己的图表色板 —— 图的皮要跟文档走,不是跟本仓走。
 * 产出侧要求**按语义层切 \`<g id>\`**(第 5 节):jsDesign 实测(2026-10-12)\`<g id>\` 会落成
 * 同名子分组(GROUP),但**换平台不保证** —— 故配方仍把「导入后回读判明」写进步骤与复核清单。
 */
export function chartByCodeRecipe(
  chart: string,
  svgPath: string | undefined,
): string {
  const out = svgPath ?? '/tmp/chart.svg';
  return `# 用代码画图表 / 数据可视化:算出 SVG → 落盘 → 导入画布

## 0. 前提:没有内置图表工具,这条路就是主路径
- **先判该不该用 SVG**:本配方适合「几何由数据算出来」的图(折线 / 面积 / 圆环 / 弧 / 热力条 / 带刻度坐标轴)—— 用矩形手拼这些要多几十倍节点还拼不准,换数据时回源重导也比在画布上挪一串节点便宜。**不适合**的三类:要排进 auto-layout 行列的、要绑变量/样式或要做成组件复用的、表格单元格与卡片骨架这类结构件 —— 这些必须原生节点(SVG **不吃布局**,\`vectorPaths.data\` 也不回读)。完整判据见 \`jsd://recipes/design-strategy\` 第 6 条。
- 图表一律这样画:**你自己写代码算几何、自己拼 SVG 字符串、落盘,再用 \`jsd_create_svg\` 导入**。本仓没有内置图表工具(别去找、也别试着调)。
- 前提是**你能执行本地命令**。做不到就改用原生图元(FRAME / RECTANGLE / TEXT / POLYGON)摆一张近似图,或换一个有 shell 的宿主。
- **不指定库**:用你最顺手的写法 —— 原生 \`Math\` 与数组方法手算坐标就够(见第 7 节的零依赖示例,它同时演示了第 5 节的分层);要用第三方包也行,唯一的判断标准是**它能不能在没有浏览器的环境里跑出字符串**。
- **不要**手算坐标硬拼几十 KB 的 SVG 再内联进 \`svg\` 入参:既费上下文又容易在换行、转义上翻车 —— 落盘传路径就是为了避开这件事。

## 1. 三步
1. 写一个脚本(什么语言都行,只要能写出文件;示例给的是 Node ESM),自己算几何、拼出 SVG **字符串**,写到本地文件。
2. **确认写成功了**(文件非空、\`<svg\` 开头):空文件是最常见的失败,别跳过这一步。
3. \`jsd_create_svg({ svgPath: "${out}", name: "<图名>" })\`。
4. \`jsd_export({ ids: [<上一步返回的 created.id>], format: "png" })\` **目视验收**:空图、元素越界、文字被裁只有导出才看得见,工具回显不算验收。

需求:${chart}

## 2. 与库无关的坑(纯计算环境都会踩)
- **没有 DOM**。凡是依赖 \`document\`/\`window\`/选择器/布局测量的代码都跑不了 —— 这类库(多是面向浏览器的图表库)直接排除;要么用它的纯计算部分,要么换写法。
- 别为了绕过这条去引 jsdom / headless 浏览器:多一层依赖、多一处失败点,而画布只要一个**静态** SVG。
- 坐标、比例、刻度、弧角**全部自己算**:先求 min/max,再线性映射到像素区间;没有任何"自动布局"可依赖。
- 画完就固定:没有交互、没有动画、没有 hover 效果 —— 输出是一次性的静态图。

## 3. 引擎侧的硬约束(违反会静默画不出来)
- 根元素必须带 \`xmlns\` 与显式 \`width\`/\`height\`/\`viewBox\`:没有尺寸时引擎解析不出节点大小。
- 颜色只用 hex(如 \`#3B82F6\`):不要 CSS 变量、命名色、\`currentColor\`。
- 不要外链:不引外部图片 / 字体 / script(\`<image href="http://…">\`、\`@import\`)。
- 文字用 \`<text>\` **并显式写** \`font-family\` 与 \`font-size\`(≥10)。SVG 里的文字最终由引擎的解析器渲染,**不保证按你写的字体走** —— 关键文案少而大。
- 画布尺寸 ≤ 2000×2000;数据点先抽稀(几千个 \`<circle>\` 既慢又逼近入参体积上限)。
- 曲线/弧用 \`C\`/\`Q\` 自己近似,**不要依赖 \`A\` 指令**(本仓 \`vectorPaths\` 模型不支持 A;引擎的 SVG 导入实测会把 A 展平成 \`C\` 段 —— 2026-10-15 jsDesign,别假定所有平台都这样)。

## 4. 配色与字号:优先用画布上已有的,别自创
- **先查再画**。动手前看这张文档本来在用哪套颜色与字号,新图跟它对齐:
  - 本地样式:读资源 \`jsd://styles\`(PAINT / TEXT / EFFECT / GRID,含 id / name / type)。
  - 变量:先 \`jsd_ping\` 看本平台的变量面(\`platformOps\` 里的变量 op 名单 + \`capabilities\`),再用 \`jsd_find\` / \`jsd_get_selection\` 读相邻节点上的 \`boundVariables\` —— 键是引擎的可绑定字段名,值里的 id **可直接回喂**变量 op,不用改名。
  - 字体:\`jsd_list_fonts\`(或资源 \`jsd://fonts\`)拿 family 与 style 的**成对全名**。
- **有参照就照抄**:颜色、字号从相邻或同层级元素上取(标题 / 正文 / 辅助三档对齐),比自己定一套更容易融进既有设计。
- **SVG 里的色值是死值**:整张图导入后,里面的 \`fill\` 不会跟着变量走。要真绑变量,就把色块按第 6 节另建原生节点再绑;否则取变量的**当前取值**写进 SVG 即可。
- **没有参照时才回退**(平台没有变量面,或文档里本来就没建):
  - 颜色只写 hex —— **不要** CSS 变量、命名色、\`currentColor\`(引擎的 SVG 解析器不认这些写法);同系列从一支主色出发,相邻值拉开明度即可。
  - 字号三档:标题 16px / 正文 12–13px / 刻度 11–12px;画布 640×360 起(内容多再调),内边距 24。

## 5. 分组:SVG 里就按语义层切 \`<g>\`,导入后才好改
- 「别平铺、按语义分层」是**通用**纪律,不是 SVG 专属(画布侧口径见配方 \`jsd://recipes/design-strategy\` 第 4 条);本节只讲 SVG 源码里怎么切。
- **每个语义层一个 \`<g>\`,各带一个 ASCII 语义 \`id\`**:\`title\` / \`plot\` / \`grid\` / \`axis-x\` / \`axis-y\` / \`series-<名>\` / \`axis-labels\` / \`legend\`。id 是你在源码里定位那一层的把手,用英文别用中文。
- **同一系列的点/线/柱放同一层,不同系列各一层** —— 「把某条折线加粗」「把网格线调淡」就都变成一层的事。切到「一层 = 之后会单独改的一个语义单位」为止:整张图套一个 \`<g>\` 是切少了,一层不套是切没了。
- **平移/缩放只写最外层那一个 \`transform\`**:绘图区统一 \`<g transform="translate(px,py)">\`,内部坐标一律从 0 起。手动挪图、改内边距只动这一个数,不用在满文件里找散落的坐标。
- **导入后读一次,判明层级有没有保住**:\`jsd_create_svg\` 回的是**一个**根节点,里面的 \`<g>\` 会不会落成子分组由引擎决定 —— **jsDesign 实测(2026-10-12)会**:每个 \`<g id>\` 变成同名 GROUP(如 \`grid\` / \`target\` / \`series-done\`),\`linearGradient\` 与 \`stroke-dasharray\` 也照常保留(圆环用 \`<circle>\` + dasharray 即可,不必碰 A 指令)。但**别把这条当跨平台事实**:换平台仍按下面回读判明。导入后立刻 \`jsd_find({ ids: [created.id], depth: 2 })\` 看一眼 —— 按 id 读子树要用 \`jsd_find\`(\`jsd_get_selection\` 只读当前选中、且只收 depth):
  - 有子层 → 直接用,顺手 \`jsd_rename_node\` 起成上面那套语义名;
  - 只有一层(整图一个矢量节点)→ 要么接受它,要么按第 6 节把「一定会改」的文字/色块另建原生节点。
- **回读路径数据看运气,别依赖它**:\`vectorPaths.data\` 在 jsDesign 上**只对「带描边」的 \`VECTOR\` 回读得到**(开放 / 闭合都行),**纯填充无描边的矢量回读是空串**(2026-10-15 真机:同一次 SVG 导入里 \`fill+stroke\` 的 \`data\` 正常、\`fill\` 的为空;几何本身没丢 —— \`jsd_export\` 导出的 SVG 里 \`d\` 完整)。所以「看一眼线画得对不对」一律靠 \`jsd_export\` 导图,别指望从回显里读坐标;要改几何就回源 SVG 重算重导,别在画布上徒手挪矢量。
- **\`jsd_create_svg\` 单独一批**:它比其它步骤慢得多,和 create/reparent/move 混在同一 \`jsd_batch\` 里实测会**整次调用超时**(且超时那批什么都没落)—— 导入这一步自己一批,拿到 \`created.id\` 再排装配批。
- **别用引用式复用**:\`<use>\` / \`<symbol>\` **实测(2026-10-15,jsDesign)不可用** —— 几何会被内联但**位置被丢掉**:两个 \`<use>\` 都叠在原点(回读里每个 \`<use>\` 落成一个 \`sym\` GROUP、坐标全是 0),导图只看到一个错位圆;别为省几行去用。\`<defs>\` 里的渐变照常保留(实测 GRADIENT_LINEAR 的两个 stop 颜色与位置都落库)。
- 分层不亏:实测 jsDesign 会**白得一套语义子分组** —— 「把异常那条系列调淡 / 隐藏网格层」这类样式级改动就能直接在画布上做,不用回源;分组没保住的平台上,SVG 源码本身也还是一份能读能改的文件,不亏。

## 6. 要能单独改的文字,导入后另建原生节点
- 整张图按**一个** SVG 节点导入(里面的 \`<g>\` 能不能保住成子层,见第 5 节的回读判据):里面的 \`<text>\` **不能保证**单独选中改文案,字体也由引擎解析器决定。
- 标题 / 图例 / 坐标轴这类「用户一定会改」的文字,导入后另用 \`jsd_create_text\` 建原生节点(位置自己按同一套内边距算),色块用 \`jsd_create_rectangle\` 补;柱 / 折线 / 弧 / 网格这类几何留在 SVG 里。
- 只是要一张能看的图就别拆 —— 拆开是为了「可编辑」,不是为了好看。

## 7. 最小可跑示例(零依赖:只用 \`Math\` 与数组;改 \`data\` 即可)
\`\`\`js
${CHART_CODE_EXAMPLE}
\`\`\`

## 8. 复核清单
- [ ] 文件非空、\`<svg\` 开头 \`</svg>\` 结尾;日志里的 bytes 是合理量级(KB 级,不是 0);
- [ ] 分层齐了(见第 5 节):每个语义层一个 \`<g id>\`,绘图区的 \`transform\` 只在最外层那一处;
- [ ] \`jsd_create_svg\` 结果里有 \`created.id\`(没有=没真导入);
- [ ] 导入后 \`jsd_find({ ids:[created.id], depth:2 })\` 看过层级:有子层就用,只有一层就按第 6 节另建要改的原生节点;
- [ ] \`jsd_export\` 出的图肉眼过一遍:轴、刻度、文字都在,没有元素跑到画布外;
- [ ] 文字要不要可编辑(见第 6 节)—— 要就把标题/图例另建原生节点,别全塞进 SVG 图层。`;
}
