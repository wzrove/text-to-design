# text-to-design 插件(jsDesign / Figma / MasterGo)

这是 text-to-design 的**设计软件插件**,负责把 AI 的话变成设计画布上的实际内容。画图形、改样式、导出图片,都是它在画布上动手。

## 前提

先装好后配套服务(text-to-design-mcp),插件才有东西可连。安装方法见仓库根目录的 README。

## 安装插件

1. 获取插件包:从 [GitHub Releases](https://github.com/wzrove/text-to-design/releases) 下载
   `text-to-design-ui-v*.zip`,解压到本地目录,里面有一个 `dist` 文件夹
   (也可以 `npm pack text-to-design-ui`,npm 包里同样带 `dist`)
2. 打开对应的设计客户端(即时设计 / Figma / MasterGo)
3. 导入**该平台那一份** manifest:即时设计点「插件」→「导入」选 `dist/jsdesign/manifest.json`;
   Figma 走「Plugins → Development → Import plugin from manifest」选 `dist/figma/manifest.json`;
   MasterGo 走「插件 → 开发者模式 → 创建/添加插件」上传 `dist/mastergo/manifest.json`
4. 回到画布运行这个插件

面板上显示「已连接」,就是准备好了。之后保持插件运行,AI 助手就能通过配套服务操作你的画布。

## 出问题了

- 面板没显示「已连接」:确认配套服务已安装并正在运行,再重新运行插件
- 不确定当前平台支持什么:点开面板的「能力」区块,列核心能力、当前平台可用的差异能力(如变量/组件属性只在 Figma 侧有)与平台特有操作
- 换了电脑或重装后:重新走一遍「安装插件」步骤

---

## 给开发者看

以下内容供开发、排查问题的人参考。

### 构建

插件构建产物在 `packages/ui/dist/`(含 `ui.html` + `code.js` + `manifest.json`),自包含、无需再构建。

```bash
pnpm install
pnpm dev        # 监听文件变化,自动重建 ui/code
pnpm build      # 构建插件包到 packages/ui/dist/
```

### 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `TEXT_TO_DESIGN_MCP_PORT` | `47812` | 插件桥接 WebSocket 端口(与配套服务一致) |
