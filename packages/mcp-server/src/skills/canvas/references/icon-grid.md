---
title: "图标网格"
when: "当需要插入一组图标并排成工具栏、单行或多行网格时读取；优先已有图标组件，按可用宽度分行。"
args: "参数 icons(逗号分隔的图标名)、size(默认 24)、gap(默认 16)"
role: user
---
# 图标组与网格

用于插入一组图标、工具栏图标或多行图标目录。先查 assets.components，已有图标组件命中就建实例。

## 排布

1. 确定用户给定的图标列表、尺寸、颜色、间距与可用宽度；未指定时可用 24px 图标、16px 间距。
2. 建语义容器 FRAME。无现成组件时 jsd_create_icon 使用 icon、size、color、strokeWidth、name；名字用图标用途或图标名，未知名称按返回候选选择。
3. 各图标返回单对象 created.id；串行导入，多步可用 batch，单批不超过 50 步。
4. 将图标 reparent 到行容器，设置 HORIZONTAL + itemSpacing + `counterAxisAlignItems:"CENTER"`；宽随内容时主轴 AUTO，行高按尺寸需求声明。
5. 一行放不下时用 VERTICAL 外容器 + 多个 HORIZONTAL 行容器。按可用宽度分行，不为塞下内容缩小约定间距。

尺寸与轴关系见 [自动布局](auto-layout.md)。同一“图标 + 底座”结构重复时先建组件再铺实例；不同图标不必为凑重复而都绑成同一主件。

## 验收

独立读取容器与图标层级，导出整组目检。batch 摘要不含路径，不能证明图标画面正确；检查是否缺图、颜色错误、描边异常或被裁切。异常先核对图标子层 fills/strokes，不给整个容器递归添加方框描边。
