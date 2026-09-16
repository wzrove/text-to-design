# text-to-design — 让 AI 帮你在设计软件里画图

<p align="center"><img src="logo.svg" width="120" alt="text-to-design logo" /></p>

text-to-design 能让 AI 助手(比如 opencode、Claude)直接在你的设计软件里动手干活:读取你选中的内容、按你的描述画新图形、修改样式、导出图片。你只管说人话,它负责操作。

这里说的设计软件,是**即时设计(jsDesign)**,国内常用的在线设计工具。

## 能做什么

- 读取画布上当前选中的内容
- 按你的描述画图,比如「在画布中心画一张 300x200 的卡片,标题叫发布页,背景浅灰」
- 修改已有内容:改颜色、改文字、挪位置、调圆角
- 导出图片:把画好的东西存成 PNG 图片
- 高级操作:把多个元素合成一个图形、把图形变成可反复复用的组件等

## 安装(三步)

整套东西由两部分组成:

- 一个**后台小服务**:负责在 AI 和设计软件之间传话,装一次即可
- 一个**设计软件插件**:负责在画布上实际动手

**第一步:让 AI 自己完成安装**

复制下面整段,丢给任意 AI 助手(opencode / Claude Code / VS Code 等)。后台服务会由 AI 自动注册和验证,中间只留两步需要你手动做:

```
请帮我完整安装 text-to-design,并按步骤汇报进度:

1. 注册 MCP 服务:用你工具原生的方式注册一个 stdio MCP server,
   命令 npx -y text-to-design-mcp@latest(无需手动安装,npx 会自动拉取运行)。

2. 验证后台服务能启动:
   timeout 5 npx -y text-to-design-mcp@latest
   预期输出含 "[text-to-design-mcp] shim 模式" 或 "daemon 就绪"(首次会自动拉起常驻服务)。

3. 安装设计软件插件,下载并解压到用户目录:
   cd ~ && npm pack text-to-design-ui
   mkdir -p text-to-design-plugin
   tar -xzf text-to-design-ui-*.tgz -C text-to-design-plugin --strip-components=1
   (若 npm 包尚未发布,改用仓库内产物:把 packages/ui/dist/ 整个目录拷到
    ~/text-to-design-plugin)

4. 上述三步完成后,告知用户剩下两步需手动:
   - 在即时设计里「插件 → 导入」,选择 ~/text-to-design-plugin/dist/jsdesign/manifest.json
     (Figma 则导入 dist/figma/manifest.json),
     运行插件,面板显示「已连接」即就绪
   - 重启 AI 会话,调用 jsd_ping 验证连通

5. 汇报完成情况。
```

**第二步:手动导入设计软件插件**

打开即时设计客户端,点「插件」→「导入」,选择 `~/text-to-design-plugin/dist/jsdesign/manifest.json`,然后回到画布运行这个插件。面板上显示「已连接」,就说明准备好了。(Figma 用户:菜单「Plugins → Development → Import plugin from manifest」导入 `dist/figma/manifest.json`。)

**第三步:重启 AI 工具**

重启你的 AI 会话,让它调用 `jsd_ping` 确认一下。通了,就能开始用。

## 怎么用

装好后,直接说人话,比如:

- 「读取当前画布选中的内容」
- 「在画布中心画一个 300x200 的卡片,标题叫发布页,背景浅灰」
- 「把选中的按钮导出成 PNG 存到 /tmp/btn.png」

## 常见问题

- **AI 说连不上插件**:先看即时设计里的插件面板是否显示「已连接」,没有就重新运行插件,然后重启 AI 会话。
- **改完配置不生效**:重启 AI 工具会话。
- **想深入排查**:看文末「给开发者看」的调试部分。

---

## 给开发者看

以下内容供开发、排查问题的人参考。

### 完整工具清单

一个操作对应一个 `jsd_*` 工具(没有 op 分发)。常用工具:

| 工具 | 说明 |
| --- | --- |
| `jsd_ping` | 检查插件是否在线,返回核心能力 / 平台差异能力 / 平台特有 op 三张表 |
| `jsd_get_selection` / `jsd_find` | 读取当前选中 / 按名称类型 id 查找节点 |
| `jsd_create_nodes` | 执行声明式设计指令(frame/rect/text/... 节点树) |
| `jsd_create_svg` / `jsd_create_icon` / `jsd_html_to_design` | 导入 SVG / 插入内置图标 / HTML 转设计节点 |
| `jsd_set_fill_color` / `jsd_set_stroke` / `jsd_set_cornerRadius` | 填充 / 描边 / 圆角 |
| `jsd_set_text` / `jsd_move_node` / `jsd_resize_node` | 文本内容排版 / 位置 / 尺寸 |
| `jsd_set_layout` / `jsd_set_effects` / `jsd_set_visibility` / `jsd_rename_node` | 自动布局 / 阴影等效果 / 显隐锁定 / 重命名 |
| `jsd_update_node` | 一次改多组字段(聚合入口) |
| `jsd_clone_node` / `jsd_group_nodes` / `jsd_reparent_nodes` / `jsd_delete_node` | 复制 / 编组 / 移入父节点 / 删除 |
| `jsd_create_component` / `jsd_create_instance` / `jsd_sync_overrides` | 建组件 / 生成实例 / 批量同步同类实例样式 |
| `jsd_batch` | 一次请求顺序执行多步,双花括号占位符串起中间值 |
| `jsd_export` | 导出节点为 PNG/JPG/SVG/PDF |
| `jsd_list_fonts` / `jsd_fill_image` | 列出可用字体 / 用本地图片填充节点 |
| `jsd_platform_op` | 平台特有能力通用通道(Figma 变量/样式/组件属性),先读 `jsd_ping` 的 `platformOps` 名单;平台不适用时由服务端直接拦截并给替代路径 |

完整工具清单见 [`packages/mcp-server/README.md`](packages/mcp-server/README.md) 末尾。

### 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `TEXT_TO_DESIGN_MCP_PORT` | `47812` | 插件桥接 WebSocket 端口(固定,被占即启动失败) |
| `TEXT_TO_DESIGN_MCP_HTTP_PORT` | `47820` | MCP HTTP 端点(shim 连 daemon 用) |
| `TEXT_TO_DESIGN_MCP_LOG` | `/tmp/text-to-design-mcp.log` | 常驻服务日志文件路径 |

### 调试

```bash
tail -f /tmp/text-to-design-mcp.log   # 服务日志:请求/响应耗时、HTTP 状态、插件连接
TEXT_TO_DESIGN_MCP_LOG_LEVEL=debug    # 更细落盘:WS 帧级收发(只影响日志文件,不影响面板)
```

插件面板自带状态与日志:服务端日志实时推送(档位切到「全部」可见 debug 帧级明细),
插件离线期间的日志先缓冲、上线时按顺序回放;另有可折叠的「能力」区块,列出核心能力、
当前平台可用的差异能力(如 Figma 的变量/组件属性)与平台特有 op 名单。

### 构建与开发

```bash
pnpm install
pnpm dev        # watch 构建 ui + jsdesign 插件脚本
pnpm build      # 构建插件包(packages/ui/dist/{jsdesign,figma}/)
pnpm typecheck  # 全量类型检查
pnpm mcp        # 开发期启动后台服务(tsx)
```
