import { RECIPES } from '../tools/recipe-catalog';

/**
 * 技能分组:把 11 条配方收成 4 个**入口**,正文仍然一条不复制。
 *
 * ## 为什么不合并成一份
 *
 * 11 条正文合计 57.5 KB(design-strategy 独占 21.5 KB)。合成一份技能 = 每次选中
 * 都要吃满 ~15k tokens,还得把「画个柱状图」和「组件体系」绑在一起读。技能的价值
 * 就在**按需只付相关的那几 KB**,所以正文不合并。
 *
 * ## 为什么入口要合并
 *
 * 11 个名字摆进客户端目录,选择的成本落在模型身上:其中 4 条同属组件/变体主题,
 * `design-strategy` 与 `auto-layout` 的判据互相重叠。收成 4 个入口后:目录短、
 * 语义互斥,入口里只放「何时用 + 分流表 + 必读纪律」,细节落 `references/` 按需读
 * (Skills over MCP 支持一个技能多文件)。
 *
 * ## 单一真源
 *
 * `references/<id>.md` 的内容 = 该配方 `render()` 的正文,由 `scripts/gen-skills.ts`
 * 构建期生成,不在本文件重写。本文件只写**入口正文**——它必然是新文字,所以刻意写短、
 * 只写"选哪条"和几条最容易违反的硬纪律;写长了就会与 references 漂开。
 *
 * `__tests__/skills-layout.test.ts` 守住两件:每条配方被且只被一个入口覆盖;
 * 入口里提到的每个 `references/*.md` 都必须真能由配方 id 生成。
 */
export interface SkillGroup {
  /** 技能名,同时是目录名 `dist/skills/<name>/` */
  name: string;
  /** 一句话:什么时候该选我(SKILL.md frontmatter 的 description) */
  description: string;
  /**
   * 入口正文(不含 frontmatter)。只写分流与最容易踩的纪律,细节交 references。
   * 必须自包含:读者可能只读这一段就动手。
   */
  body: string;
  /** references/<id>.md — id 必须是 RECIPES 里存在的配方 id */
  references: readonly string[];
}

export const SKILL_GROUPS: readonly SkillGroup[] = [
  {
    name: 'design',
    description:
      '从零设计界面 / 整页:复用件选型、样式落地、结构分层、屏内分区排布(auto-layout)。开画之前先读我',
    body: `# 画布设计:开工前的纪律

## 先读这一条的理由

跳过纪律的代价是可量化的:2026-11 一次整屏任务里,没用 auto-layout、没读图表配方、
手摆坐标硬拼,结果坐标被引擎按绝对系解释、导出空白、柱图重做,返工六轮。纪律不省时间,
它只是把返工挪到前面。

## 开工顺序(不许跳)

1. **读资源清单** \`jsd_get_page\`(assets.summary 给组件/变体/样式/变量四类计数)。
   命中的一律复用:组件 → \`jsd_create_instance\`;变体切值 → \`jsd_set_instance_properties\`;
   样式/变量 → 按 \`jsd_ping\` 的 platformOps 入口。清单里没有才许新建。
2. **定结构再建节点**。屏 → 语义分区(侧栏/顶栏/筛选条/KPI 行/卡片)→ 卡片内按语义编组。
   每个元素都要有归属容器,不许直挂屏根;name 必传且语义化。
3. **同轴等距一律 auto-layout**,不要手算坐标。这是本条最常被违反的一条,
   判据与两条落地路径见 \`references/auto-layout.md\`。
4. **图形区先判 SVG 还是原生图元**。几何由数据算出来的(折线/柱/环形/弧/坐标轴)
   走代码生成 SVG 再 \`jsd_create_svg\`;表格骨架、要进 auto-layout 的、要绑变量或做组件的,
   必须原生节点。
5. 建完 \`jsd_export\` **目视验收**。工具回显不是验收证据。

## 三条硬约束(违反会静默失败)

- **子节点 x/y 按页面绝对坐标解释**(文档写相对父节点,引擎实测是绝对)。按相对坐标写完
  再导出,内容会被父容器裁掉 —— 看着像"文字丢了"。
- **父级 move/delete 会连带位移子树**。要挪已建好的容器,挪完必须重新核对子层坐标。
- **同级节点不进父画板导出**。\`jsd_create_svg\` 落在页面层的东西,必须先
  \`jsd_reparent_nodes\` 进目标容器,否则导出的屏里看不见它。

## 尺寸模式:只有屏根才写死两轴

开布局的容器要给 \`primary|counterAxisSizingMode\`。选错不报错,只会留下死白或被裁的内容:

| 容器 | 该选的模式 |
| --- | --- |
| 弹窗 / 卡片 / 标签 / 按钮 | 内容方向 \`AUTO\`(hug)—— 高度由内容定,改文案不用重算 |
| 屏根 / 侧栏 / 固定栅格 / 表格 | 两轴 \`FIXED\` —— 有外部约束,撑开就破版 |

\`AUTO\` 只在**另一个轴**给了 \`FIXED\` 时才稳(例:宽 420 FIXED + 高 AUTO)。
回读 \`sizingMode\` 是 AUTO、高度被重算成内容高度,是引擎的 **hug 语义,不是失败**;
反过来固定高填不满内容就剩死白 —— 实测 220 的弹窗开 hug 变 184,少掉的 36px 就是那块空白。

## 细节按需读

- \`references/design-strategy.md\` — 完整纪律:复用件选型、样式落地与 \`*StyleId\` 记账、
  分层深度、层序与遮挡、字号与间距阶梯、出错回滚
- \`references/auto-layout.md\` — 该不该上布局、两条落地路径、最易漏的分区、验收判据
- \`references/html-to-design.md\` — 已有 HTML 转设计稿
- \`references/icon-grid.md\` — 批量插图标并排网格

## 别做的事

- 别把整屏的树塞进一次 \`children\`(易整批失败):用 \`jsd_batch\` 分批建,再逐层归组。
- 别在画布上徒手挪矢量:几何回源 SVG 重算重导。
- 别把 warnings 当提示跳过 —— 它点名的都是"回显成功但没生效"。
`,
    references: [
      'design-strategy',
      'auto-layout',
      'html-to-design',
      'icon-grid',
    ],
  },
  {
    name: 'charts',
    description:
      '画图表 / 数据可视化(折线、柱状、饼图/环形、散点、雷达、面积、桑基、仪表盘、看板):用代码算几何、落盘 SVG 再导入',
    body: `# 图表:用代码画,不要手拼图元

## 一句话

本仓**没有内置图表工具**。图表一律:自己写脚本算几何 → 拼 SVG 字符串 → 落盘 →
\`jsd_create_svg({ svgPath })\` 导入。拿矩形手拼折线/环形要多几十倍节点,还拼不准。

## 最小流程

1. 写脚本(什么语言都行)算坐标、拼 SVG、写到本地文件
2. **确认写成功**(非空、\`<svg\` 开头)—— 空文件是最常见的失败
3. \`jsd_create_svg\` **单独一批**(它慢,混在 \`jsd_batch\` 里会整批超时)
4. \`jsd_find\` 回读层级,再 \`jsd_export\` **目视验收**
5. 需要放进某个卡片:\`jsd_reparent_nodes\` 进目标容器(同级节点不会被父画板导出)

## 引擎硬约束(违反静默画不出来)

- 根元素必须带 \`xmlns\` + 显式 \`width/height/viewBox\`
- 颜色只写 hex,不认 CSS 变量 / 命名色 / \`currentColor\`
- 不引外链(图片、字体、script)
- \`<text>\` 显式写 \`font-family\` 与 \`font-size\`(≥10);关键文案少而大
- 画布 ≤2000×2000;曲线用 \`C\`/\`Q\`,**不要 \`A\` 指令**
- 按语义切 \`<g id="plot|grid|series-*|axis-labels|legend">\`,绘图区只在外层写一个 \`transform\`

## 分工

- 几何(柱/线/弧/网格)留在 SVG 里
- 标题/图例/坐标轴这类**一定会被改**的文字,导入后另建原生 \`jsd_create_text\`

完整判据、零依赖示例、导入后回读与验收清单见 \`references/chart-by-code.md\`。
`,
    references: ['chart-by-code'],
  },
  {
    name: 'components',
    description:
      '组件与变体:抽组件、变体集与维度、实例属性、批量同步样式、变量绑定。要复用或要"改一处生效全局"时读我',
    body: `# 组件体系:结构走组件、状态走变体、视觉走样式、语义 token 走变量

## 先判该不该抽组件

**抽**:≥2 个结构一致的同级单元;差异只落在取值(文案/颜色/显隐)。
**不抽**:差异落在实例子节点上、平台未声明 \`inPlaceVariants\`、往返预算压不住 —— 这些情况
抽了反而要逐个改实例,不如直接建。

命名统一走「组件族/状态」,方便下次 \`jsd_get_page\` 命中复用。

## 四条对应关系

| 要复用的是 | 用什么 |
|---|---|
| 结构 | COMPONENT + INSTANCE |
| 状态 | 变体集(维度 + 取值) |
| 固定视觉 | 样式(PAINT / TEXT / EFFECT / GRID),绑 \`*StyleId\` |
| 语义 token | 变量,按集合/模式取值 |

## 批量改动:改源头,别逐个改实例

- 改主组件 → 所有实例继承。想让**单个**实例不同,先 \`jsd_detach_instance\`
- 实例子节点上的样式覆盖平台不保证渲染;命中时结果 warnings 会给主组件里对应子节点的 id
- 批量刷样式用 \`ids\` 一次下发;\`recursive=true\` **只作用于后代**,连容器自己一起改要
  \`includeSelf=true\`

## 细节按需读

- \`references/component-property.md\` — 组件属性(布尔/文本/换绑)的定义与设值,按平台分流
- \`references/variant-set.md\` — 变体集构建:合成 COMPONENT_SET、加维度、加成分
- \`references/variant-sync.md\` — 同类实例样式批量同步
- \`references/variable-binding.md\` — 变量绑定与批量套用(按平台变量面分流)
`,
    references: [
      'component-property',
      'variant-set',
      'variant-sync',
      'variable-binding',
    ],
  },
  {
    name: 'bulk-ops',
    description:
      '批量与编排:多步画布操作合成一次调用、整页/整档批量改造、批量改文案。步骤多、往返多、上下文吃紧时读我',
    body: `# 批量与编排:先想清楚要不要用脚本

## 判据

- **一次调用能说清的**(建一棵小树、改一组属性)→ 直接 \`jsd_batch\`,别绕
- **清单装不下上下文**(几十步、每步 id 都要回传)→ \`callsFile\` 传 JSON 文件路径,
  id 不进上下文;同一份文件也能用 CLI \`text-to-design-mcp exec <文件>\` 直接跑
- **要读回判断再决定下一步** → 分块切批,每块一次调用后回读复核

## batch 的三条纪律

1. **占位符只在同一次调用内有效**:跨批次引用必报「占位符引用的步骤不存在」。
   跨批次请硬编码上一步回显里的真实 id。
2. **回显不含子节点**:节点是整对象摘要化,\`children\`/\`characters\`/\`fills\` 都不在回显里。
   要读子树就单独调一次该工具,别当成"子节点没了"。
3. **结构变更后有漂移复核**(默认开):引擎在删改结构后会把**没碰到**的兄弟节点静默挪走。
   warnings 里给了原值,照原值 \`jsd_move_node\` 回填。

## 批量改文案

在一棵子树里定位并批量替换,命中范围与命名纪律见 \`references/text-replace-strategy.md\`;
编排与切批的完整套路见 \`references/script-ops.md\`。

## 收尾

含图标/矢量/文字的批次,配一次 \`jsd_export\` 目视验收 —— 回显不等于生效。
`,
    references: ['script-ops', 'text-replace-strategy'],
  },
];

/** 校验:每条配方被且只被一个入口覆盖,且没有入口引用不存在的配方 */
export function assertSkillGroupsCoverRecipes(): void {
  const recipeIds = new Set(RECIPES.map((r) => r.id));
  const seen = new Map<string, string>();
  for (const group of SKILL_GROUPS) {
    for (const ref of group.references) {
      if (!recipeIds.has(ref)) {
        throw new Error(`技能 ${group.name} 引用了不存在的配方:${ref}`);
      }
      const owner = seen.get(ref);
      if (owner != null) {
        throw new Error(
          `配方 ${ref} 同时被 ${owner} 与 ${group.name} 引用:一个技能正文只能有一份`,
        );
      }
      seen.set(ref, group.name);
    }
  }
  const missing = [...recipeIds].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new Error(`有配方没被任何技能入口覆盖:${missing.join(', ')}`);
  }
}
