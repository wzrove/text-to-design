import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { ToolHandle } from '../core/registry';

/** 高频配方 prompt:可复用的操作引导词(只收工具 description 覆盖不到的流程级内容) */
export function registerPrompts(server: McpServer): ToolHandle[] {
  const designCard = server.registerPrompt(
    'design-card',
    {
      title: '设计卡片',
      description:
        '在画布生成一张带标题的卡片,严格遵循「平铺创建 + reparent 归组 + 事后设布局」纪律',
      argsSchema: z.object({
        title: z.string().describe('卡片主标题文案'),
        subtitle: z.string().optional().describe('副标题文案(可选)'),
        width: z
          .string()
          .optional()
          .describe(
            '卡宽 px 的数字字符串,默认 "320"(MCP prompt 参数均为字符串)',
          ),
        height: z
          .string()
          .optional()
          .describe('卡高 px 的数字字符串,默认 "200"'),
      }),
    },
    ({ title, subtitle, width, height }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: cardRecipe(
              String(title),
              subtitle == null ? undefined : String(subtitle),
              Number(width) || 320,
              Number(height) || 200,
            ),
          },
        },
      ],
    }),
  );

  const htmlToDesign = server.registerPrompt(
    'html-to-design',
    {
      title: 'HTML 转设计稿',
      description: '把一段 HTML 转为画布节点,含保真度取舍说明',
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
            text: `请把下面的 HTML 转成设计稿。默认走 jsd_html_to_design(SVG 保真,忽略复杂样式);需要可编辑图层时才改用 jsd_create_nodes 手工映射(容器→FRAME、文本→TEXT、图形→VECTOR)后 reparent 归组。\n\nHTML:\n\`\`\`\n${String(html)}\n\`\`\`${name == null ? '' : `\n节点名:${String(name)}`}`,
          },
        },
      ],
    }),
  );

  const iconGrid = server.registerPrompt(
    'icon-grid',
    {
      title: '图标网格',
      description: '批量插入 Lucide 图标并排成自动布局网格',
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
            text: `请插入图标网格:1) jsd_create_nodes 建一个 FRAME 容器;2) 每个图标各调一次 jsd_create_icon(size=${Number(size) || 24});3) jsd_manage_nodes op=reparent 把全部图标移入容器;4) jsd_update_node 给容器设 auto-layout(layoutMode=HORIZONTAL,itemSpacing=${Number(gap) || 16},counterAxisAlignItems=CENTER)。\n图标列表: ${String(icons)}`,
          },
        },
      ],
    }),
  );

  const scriptOps = server.registerPrompt(
    'script-ops',
    {
      title: '脚本化批量调用',
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
      title: '设计策略总纲',
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
            ),
          },
        },
      ],
    }),
  );

  const textReplace = server.registerPrompt(
    'text-replace-strategy',
    {
      title: '文本批量替换策略',
      description:
        '大改文案的安全流程:clone 留底 → 按语义分块 → jsd_update_node ids 批量替换 → 逐块导小图复核',
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
      title: '同类实例样式批量同步',
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

  // 配方是静态引导词,不依赖插件连接 → 恒可用
  return [
    designCard,
    htmlToDesign,
    iconGrid,
    scriptOps,
    designStrategy,
    textReplace,
    variantSync,
  ].map((handle) => Object.assign(handle, { alwaysEnabled: true }));
}

function cardRecipe(
  title: string,
  subtitle: string | undefined,
  width: number,
  height: number,
): string {
  const texts =
    subtitle == null
      ? `1 个 TEXT 主标题「${title}」`
      : `1 个 TEXT 主标题「${title}」和 1 个 TEXT 副标题「${subtitle}」`;
  return `请在画布中心创建一张 ${width}x${height} 的卡片:
1) jsd_create_nodes 一次平铺创建 FRAME 底板(圆角 12、浅色填充)与${texts};
2) jsd_manage_nodes op=reparent 把文本移入 Frame;
3) jsd_update_node 给 Frame 设 auto-layout(VERTICAL,itemSpacing=8,padding=24,counterAxisAlignItems=CENTER),主标题 fontSize 加大。`;
}

/** 脚本化调用配方:压缩工具往返次数与上下文占用 */
function scriptRecipe(task?: string): string {
  const head =
    task == null
      ? '请按以下「脚本化」纪律调用 text-to-design 工具:'
      : `请用「脚本化」方式完成下面的任务:\n${task}\n\n执行要求:`;
  return `${head}
1) 多步流程一次成型:优先 jsd_batch 编排(create→reparent→update、find→批量修改、图标×N 等);宿主有代码执行工具时也可写一段脚本连续 await 多个 tools.jsd_*。
2) 中间值只在管道内流动:上游结果用双花括号占位符(步骤id.字段路径)注入下游参数(脚本内用变量传递);每步只提取后续需要的字段,不回传完整序列化结果。
3) 收敛:最后只做一次 jsd_get_selection(depth=1) 总复核,不要每步都复核。`;
}

/** 设计策略总纲:把 server.ts 里 INSTRUCTIONS 的三条纪律展开成可照着走的完整流程 */
function designStrategyRecipe(screen?: string): string {
  const target = screen == null ? '当前设计' : `「${screen}」`;
  return `# 画布创作纪律

1) 先摸底再动手:jsd_get_selection(depth=2) 看现状(名称/类型/尺寸/填充/子结构),已有节点用 jsd_find 精确定位,不要重复创建同名元素。
2) 一层只建一层:每个界面先建主容器 FRAME,再分区放内容。复杂结构用 jsd_create_nodes 一次平铺建完,不要用 children 深嵌套(易整体失败)。
3) 命名语义化:用「登录页 / Logo 容器 / 邮箱输入 / 主按钮」这类说明用途的名字,不用「矩形 1」「Frame 2」;同一批元素命名风格保持一致。
4) 归组后再布局:jsd_manage_nodes op=reparent 把文本等元素移入目标容器;auto-layout(layoutMode/itemSpacing/padding*/primaryAxisAlignItems 等)最后用 jsd_update_node 单独设,别在建节点时混着传。
5) 间距与字号阶梯:主标题 > 正文标签 > 按钮文本 > 辅助说明;同级元素间距一致,用 itemSpacing 统一控制,不靠手调坐标凑。
6) 视觉顺序:自上而下按阅读顺序排布,主操作按钮放在输入项之后,次要链接(忘记密码/注册)放最后。
7) 出错回滚:ok=false 或「没找到 X 节点」→ jsd_find 复核 id 是否已失效(可能被连坐删除),必要时 jsd_manage_nodes op=repair 清理后重试。
8) 收敛复核:整批做完只做一次 jsd_get_selection(depth=1),或 jsd_export 导小图(scale=0.5)看效果;不要每步都读一遍。

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
- 不按坐标硬切;语义相关的文本应同批处理,这样一次 jsd_update_node 就能覆盖一整块。

## 2. 先留安全副本
- jsd_manage_nodes op=clone 复制一份原文案版本。确认改完没问题再删(或重命名为「原文案备份」留档)。

## 3. 分块批量替换
- 每块一次 jsd_update_node:ids 传该块全部文本节点 id,逐条改 characters;需要时连带 fontSize/lineHeight 一起调,避免改完溢出容器。
- ids 来自上一步查询时,用 jsd_batch 的 {{步骤id.字段路径}} 占位符直接串起来,中间 id 不回传模型。

## 4. 逐块复核
- 每替换完一块,jsd_export 导出该块(scale=0.5)看一眼:文字是否溢出容器、层级有没有乱、间距有没有被撑开。
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
- jsd_find(${target}) 拿到全部目标实例 id;缺的实例用 jsd_manage_components op=create_instance 补建。

## 3. 批量套用(优先引擎级)
- 首选 jsd_manage_components op=sync_overrides:sourceId=源实例 id,ids=全部目标 id,一次完成「复制+套用」(自动同步变体/组件属性/可见样式文本,不动位置)。
- 需要先审后套或多次套用同一快照时,用两段式:先 op=copy_overrides(sourceId) 拿到 snapshotId,再 op=apply_overrides(sourceId, ids) 批量套用(可加 swapToSource=true 把目标换绑成源组件)。
- 引擎不支持时再退化为手工:jsd_update_node ids=[目标] 填字段 + jsd_manage_components op=set_instance_properties 设变体值。

## 4. 复核
- jsd_export(scale=0.5) 抽查一张,确认间距与层级没被撑乱;再 jsd_get_selection(depth=1) 总复核。`;
}
