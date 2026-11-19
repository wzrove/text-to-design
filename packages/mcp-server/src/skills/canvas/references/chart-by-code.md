---
title: "代码画图表与数据可视化"
when: "当需要把数据画成折线、柱状、环形等图表或看板绘图区时读取；覆盖代码生成 SVG、导入装配、路径错误处置与可编辑文字分工。"
args: "必填 chart(图种 + 数据 + 聚合口径)；可选 svgPath(MCP 服务进程可读的 SVG 输出绝对路径，默认 /tmp/chart.svg)"
---
# 代码画图表与数据可视化

默认精简档把本配方的绘制与编辑操作放入 `jsd_batch`，工具名填 `calls[].tool`；用 `jsd_describe_tools` 的 names 查步骤参数。

用于折线、柱状、环形、散点、雷达、面积、桑基等数据几何。默认用本地代码生成 SVG，再导入画布；布局、组件与绑定需求见 [设计策略](design-strategy.md)。通用失败处置与视觉验收按主技能「执行闭环」。

## 1. 输入与表达

1. 明确图种、数据、单位、聚合口径、目标尺寸；读取已有样式和参照节点。只有缺失信息会改变结论时才询问；示意数据须标明，不伪装为真实数据。
2. 检查空数据、非有限值、负值、全零和单点。确定值域、零基线与刻度，再映射像素；柱图通常包含零基线。抽稀或汇总须保留数据含义。
3. 数值几何用 SVG；需独立改文案的标题、图例、刻度和数值用原生 TEXT。需进入 auto-layout、绑变量或做组件的结构用原生节点。
4. 能运行本地命令时，选能直接输出 SVG 字符串的实现；简单图不引入浏览器或 DOM 依赖。不能执行代码时，小图可用原生图元；复杂图先说明所缺能力，不声称已经精确生成。

## 2. 生成、导入、装配

1. 脚本与 SVG 写入允许的工作目录。输出路径必须是 **MCP 服务进程可读取**的路径；本地执行环境与服务分离时，先确认文件可达。
2. 确认文件非空、SVG 根合法、有显式 width/height/viewBox；不要把几十 KB 字符串手写进工具参数。
3. 单步提交 `jsd_batch`，tool 为 `jsd_create_svg`，args 为 `{svgPath:SVG绝对路径, name:图名}`，避免长耗时导入拖累装配。只有内联 SVG 可用时传 `svg`，二选一。
4. 取 `results[0].data.created.id`，用 `jsd_find({ids:[图id], depth:2})` 检查分组。导入入口不收 x/y/placement；再批处理 `jsd_reparent_nodes` 到目标容器，按需加入 `jsd_move_node` / `jsd_resize_node` 步骤。
5. 补原生文字与图例，再 `jsd_export` 整张卡片或绘图区目检。几何修改回源重算；替换时仅处理本任务创建且已确认被替代的旧节点。

## 3. 零依赖示例：折线绘图区

保存为允许目录中的 chart.mjs，执行 `node chart.mjs <输出SVG路径>`；省略路径时写 `/tmp/chart.svg`。示例数据仅用于演示。标题、刻度、图例另建原生文本。

```js
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const output = process.argv[2] ?? '/tmp/chart.svg';
const data = [12, 18, 15, 26, 31, 28, 36];
if (!data.length || !data.every(Number.isFinite)) {
  throw new Error('数据须为非空有限数值数组');
}
const width = 640, height = 360, pad = 24;
const plotW = width - pad * 2, plotH = height - pad * 2;
let lo = Math.min(0, ...data), hi = Math.max(0, ...data);
if (lo === hi) { lo -= 1; hi += 1; }
const x = (i) => data.length === 1 ? plotW / 2 : plotW * i / (data.length - 1);
const y = (v) => plotH * (hi - v) / (hi - lo);
const path = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ');
const points = data.map((v, i) => `<circle cx="${x(i).toFixed(2)}" cy="${y(v).toFixed(2)}" r="3" fill="#3B82F6"/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<g id="plot" transform="translate(${pad},${pad})">
<g id="axis"><path d="M0 ${y(0).toFixed(2)} H${plotW}" fill="none" stroke="#D1D5DB"/></g>
<g id="series-active"><path d="${path}" fill="none" stroke="#3B82F6" stroke-width="2"/>${points}</g>
</g></svg>`;
const absolutePath = resolve(output);
mkdirSync(dirname(absolutePath), { recursive: true });
writeFileSync(absolutePath, svg, 'utf8');
console.log(JSON.stringify({ svgPath: absolutePath, bytes: Buffer.byteLength(svg) }));
```

## 4. 数据、路径与能力错误处置

- 空数据、NaN、Infinity 或全零值域：先修数据或明确值域策略，不输出带无效坐标的 SVG；示意数据须在交付中标注。
- `svgPath` 读取失败：确认绝对路径可被 **MCP 服务进程**读取；小图可改传 `svg`，不要声称已经导入。
- `jsd_create_svg` 报二选一校验：只传 `svg` 或 `svgPath` 之一。两者都不传或同时传，原样重试无效。
- 无法执行本地代码：小图用原生图元；复杂图报告缺失能力，不伪造精确几何或数据源。
- 几何替换失败：回到源脚本与数据重算；只替换本任务创建且已确认被替代的旧节点，避免重复导入。

## 5. SVG 导入约束

- 根带 xmlns 与显式 width、height、viewBox；默认以不超过 2000×2000 的适中尺寸生成，大量点先按口径抽稀。
- 色值用 hex，避免 CSS 变量、currentColor、外链图片或字体、script。
- 按语义分 `<g id="grid">`、`<g id="axis">`、`<g id="series-revenue">` 等，id 用 ASCII。绘图区平移集中在外层 transform。
- 即时设计实测可保留 g 分组、渐变与 dash；换平台后回读，不保证所有 SVG 都得到相同可编辑层级。
- 即时设计的 use/symbol 引用可能丢位置；直接输出对应几何。渐变 defs 与引用式图元复用不同，不必一并移除。
- 原生 vectorPaths 只支持 M/L/Q/C/Z。SVG 导入对 A 的转换依引擎而异，需要跨平台稳定圆弧时用 C/Q 近似或受支持的 circle/dash。
- 路径回读可能为空，尤其即时设计纯填充矢量；不据此判断几何丢失。以导图确认，修改时保留源文件。
- SVG 文本的字体与可编辑性由引擎决定；关键可编辑文案用原生 TEXT，避免同一文案在 SVG 与原生层重复。

## 6. 完成条件

- 数据点数量、比例、零基线与口径正确；无 NaN/Infinity 或误导性截断。
- SVG 已导入目标容器，关键文案可按需求编辑。
- `jsd_export` 导出的图中轴、系列、图例与文字齐全，没有越界、裁切或空白。
- 报告生成文件位置与示意数据、抽稀、不可编辑部分等实际限制。
