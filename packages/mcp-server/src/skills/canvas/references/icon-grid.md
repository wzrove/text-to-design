---
title: "图标组与网格"
when: "当需要插入一组图标并排成工具栏、单行或多行网格时读取；优先已有图标组件，按可用宽度分行。"
args: "必填 icons(逗号分隔的图标名)；可选 size(字符串，默认 24)、gap(字符串，默认 16)"
---
# 图标组与网格

默认精简档把本配方的绘制与编辑操作放入 `jsd_batch`，工具名填 `calls[].tool`；用 `jsd_describe_tools` 的 names 查步骤参数。

用于插入一组图标、工具栏图标或多行图标目录。先 `jsd_get_page` 查 `assets.components`，已有图标组件命中就建实例。通用失败处置与视觉验收按主技能「执行闭环」。

## 排布

1. 确定用户给定的图标列表、尺寸、颜色、间距与可用宽度；未指定时可用 24px 图标、16px 间距。prompt 的 `size` / `gap` 是字符串参数；传给 `jsd_create_icon` 的 `size` 与布局 itemSpacing 时按对应 schema 用数值。
2. 建语义容器 FRAME。无现成组件时 `jsd_create_icon` 使用 icon、size、color、strokeWidth、name；名字用图标用途或图标名。
3. 各图标返回单对象 `created.id`；串行导入，多步可用 `jsd_batch`，单批不超过 50 步。
4. 将图标 `jsd_reparent_nodes` 到行容器，设置 HORIZONTAL + itemSpacing + `counterAxisAlignItems:"CENTER"`；宽随内容时主轴 AUTO，行高按尺寸需求声明。
5. 一行放不下时用 VERTICAL 外容器 + 多个 HORIZONTAL 行容器。按可用宽度分行，不为塞下内容缩小约定间距。

尺寸与轴关系见 [自动布局](auto-layout.md)。同一“图标 + 底座”结构重复时先建组件再铺实例；不同图标不必为凑重复而都绑成同一主件。

## 特有错误与验收

- 图标名查无时，用 `jsd_create_icon` 返回的候选名修正，不猜近似名或重复尝试同一名称。
- `jsd_batch` 超过 50 步、占位符失效或路径不可读时按主技能「错误处置」拆批与修参数；`jsd_create_svg` 的耗时导入不要混入图标装配批。
- 独立读取容器与图标层级，`jsd_export` 导出整组目检。batch 摘要不含路径，不能证明图标画面正确；检查是否缺图、颜色错误、描边异常或被裁切。异常先核对图标子层 fills/strokes，不给整个容器递归添加方框描边。
