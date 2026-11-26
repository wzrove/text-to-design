---
title: "图标检索与网格"
when: "当需要插入图标并排成工具栏、单行或多行网格时读取;先检索 Iconify,再退回本地 Lucide,实在没有才手绘 SVG,按可用宽度分行。"
args: "必填 icons(逗号分隔的图标名、语义词或 Iconify id);可选 size(字符串,默认 24)、gap(字符串,默认 16)"
---
# 图标检索与网格

默认精简档把本配方的绘制与编辑操作放入 `jsd_batch`,工具名填 `calls[].tool`;用 `jsd_describe_tools` 的 names 查步骤参数。

用于查找并插入一组图标、工具栏图标或多行图标目录。先 `jsd_get_page` 查 `assets.components`,已有图标组件命中就建实例。通用失败处置与视觉验收按主技能「执行闭环」。

## 找图标(按顺序)

1. **复用**已有图标组件或画布里的同款矢量,不为凑图标另造一套。
2. **检索 Iconify。** 先看项目现有图标:线形还是填充、描边 1.5/2px、圆角还是直角。把中文意图翻成 1-3 个英文关键词(设置→`settings`,搜索→`search`,删除→`trash`),调 `jsd_search_icons({query,limit:6,style:"line"|"solid"})`。默认只查 MIT/Apache/ISC 等宽松许可集合;结果里的 `license` 必须看一眼,交付物没有署名位就避开需要署名的集合(可用 `prefixes` 限定)。
3. **选型。** 同一组图标用同一集合同一种线形/填充风格,不要一个线性一个实心。`palette:true` 的多色图标不跟随 `color`;需要统一着色时选 `palette:false`。结果太少时换同义词再搜一次,或按 `collection`/`tags` 收窄。
4. **插入。** 取结果里的 `id`(`prefix:name`)传给 `jsd_create_icon({icon:id,size,color,strokeWidth,name})`。`color` 与 `strokeWidth` 会覆盖到 Iconify 线形图标,使线宽跟项目一致;填充图标没有 stroke,`strokeWidth` 不产生效果,此时按项目需要选 `style:"solid"` 或改用手绘。
5. **兜底 Lucide。** 搜索网断或无合适结果时,用本地内置名 `jsd_create_icon({icon:"search"})`,查无时按返回候选修正。
6. **最后才手绘。** 本地与 Iconify 都没有可用图形(品牌符号、独有示意)时,用 24×24 viewBox 画与当前线宽/圆角一致的简单 SVG,`jsd_create_svg` 导入后目检;不要凭记忆精确复刻受商标保护的 logo。

## 排布

1. 确定尺寸、颜色、间距与可用宽度;未指定时用 24px 图标、16px 间距。prompt 的 `size` / `gap` 是字符串参数;传给 `jsd_create_icon` 的 `size` 与布局 itemSpacing 时按对应 schema 用数值。
2. 建语义容器 FRAME。嵌入按钮/工具栏时，不要把 `icon` 写进 `jsd_create_frame` 的 `children`（不支持）；先预留定宽定高、两轴 `FIXED` + 两轴 `CENTER` 的具名图标槽，再将 `jsd_create_icon` 返回的节点 `jsd_reparent_nodes` 移入槽位。图标名用用途或检索词，不用 `icon-1` 这类无语义名。
3. 各图标返回单对象 `created.id`;串行导入,多步可用 `jsd_batch`,单批不超过 50 步。
4. 将图标 `jsd_reparent_nodes` 到行容器,设置 HORIZONTAL + itemSpacing + `counterAxisAlignItems:"CENTER"`;宽随内容时主轴 AUTO,行高按尺寸需求声明。
5. 一行放不下时用 VERTICAL 外容器 + 多个 HORIZONTAL 行容器。按可用宽度分行,不为塞下内容缩小约定间距。

尺寸与轴关系见 [自动布局](auto-layout.md)。同一“图标 + 底座”结构重复时先建组件再铺实例;不同图标不必为凑重复而都绑成同一主件。

## 特有错误与验收

- `jsd_search_icons` 无结果:换英文同义词或放宽 `prefixes` 再试;持续为空就走本地 Lucide,最后手绘。不要重复同一查询。
- `jsd_search_icons` 网络失败:按离线处理,用本地 Lucide;不要把网络错误当成“图标不存在”。
- Iconify id 报无效:确认格式 `prefix:name`,只用检索结果里原样返回的 id,不拼近似名。
- 图标名查无时,用 `jsd_create_icon` 返回的候选名修正,不猜近似名或重复尝试同一名称。
- `jsd_batch` 超过 50 步、占位符失效或路径不可读时按主技能「错误处置」拆批与修参数;`jsd_create_svg` 的耗时导入不要混入图标装配批。
- 独立读取容器与图标层级，`jsd_export` 导出整组目检。batch 摘要不含路径，不能证明图标画面正确；检查是否缺图、颜色错误、描边异常、被裁切，以及**近形变体是否准确**（如 `code` 为 `<>`、`code-xml` 才是 `</>`）。发现变体不符时删除旧图标、按精确名重建并移入原槽位；描边异常先核对图标子层 fills/strokes，不给整个容器递归添加方框描边。