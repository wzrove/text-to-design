# text-to-design 后台服务

让 AI 助手直接帮你操作即时设计(jsDesign)画布:读取选中内容、按描述画图、改样式、导出图片。装好后不用手动启动任何东西,打开 AI 工具就能用。

这里说的「后台服务」,就是负责在 AI 和设计软件插件之间传话的那个小帮手。

## 能做什么

- 读取画布当前选中的内容
- 按你的描述画图:卡片、按钮、文字、形状等
- 修改已有内容:改位置、颜色、文字、圆角
- 把多个元素合成一个图形、给图形加轮廓
- 把图形变成可反复复用的组件
- 导出图片(PNG / JPG / SVG / PDF)
- 用本地图片填充图形

## 安装(三步)

**第一步:告诉 AI 工具**

后台服务不用手动安装,注册命令统一为 `npx -y text-to-design-mcp@latest`,任意 AI 工具都会自动化拉取运行。把下面需求丢给 AI,它会自动注册并验证:

```
请帮我完成 text-to-design 安装,并按步骤汇报进度:

1. 注册 MCP 服务:用你工具原生的方式注册一个 stdio MCP server,
   命令 npx -y text-to-design-mcp@latest(无需手动安装,npx 会自动拉取运行)。

2. 验证后台服务能启动:
   timeout 5 npx -y text-to-design-mcp@latest
   预期输出含 "[text-to-design-mcp] shim 模式" 或 "daemon 就绪"(首次会自动拉起常驻服务)。

3. 安装设计软件插件,下载并解压到用户目录:
   cd ~ && npm pack text-to-design-ui
   mkdir -p text-to-design-plugin
   tar -xzf text-to-design-ui-*.tgz -C text-to-design-plugin --strip-components=1

4. 上述三步完成后,告知用户剩下两步需手动:
   - 在即时设计里「插件 → 导入」,选择 ~/text-to-design-plugin/dist/manifest.json,
     运行插件,面板显示「已连接」即就绪
   - 重启 AI 会话,调用 jsd_ping 验证连通

5. 汇报完成情况。
```

若希望全局安装(装一次、不依赖联网拉取),可 `npm i -g text-to-design-mcp`,注册命令可简化为 `text-to-design-mcp`。

**第二步:安装设计软件插件**

先拿到插件包(任选):

| 管理器 | 命令 |
| --- | --- |
| npm | `npm pack text-to-design-ui` |
| pnpm | `pnpm pack text-to-design-ui` |
| yarn | `yarn dlx npm pack text-to-design-ui` |

解压得到的安装包里有个 `dist` 文件夹。在即时设计里点「插件 → 导入」,选择里面的 `manifest.json`,然后回到画布运行插件。面板显示「已连接」就是准备好了。

**第三步:重启 AI 工具**

改完重启 AI 工具会话(首次使用会自动拉取后台服务并常驻运行)。

## 怎么用

打开会话后直接说人话,比如:

- 「读取当前画布选中的内容」
- 「在画布中心画一个 300x200 的卡片,标题叫发布页,背景浅灰」
- 「把选中的按钮导出成 PNG 存到 /tmp/btn.png」

想确认插件通不通,先让它调 `jsd_ping`。

## 常见问题

- **AI 说连不上插件**:看即时设计里的插件面板是不是「已连接」,没有就重新运行插件,再重启 AI 会话
- **改了配置没反应**:重启 AI 工具会话
- **想深入排查**:看文末「给开发者看」的日志部分
- **旧版升级见下方「升级」**

## 升级

新版起会自动替换:启动时若检测到旧版常驻服务,会自动关停并拉起新版,无需手动操作。

仅从旧版(没有自动替换能力)升级时,首次需手动清理一次残留的常驻服务:

```bash
pkill -f text-to-design-mcp
```

之后任意一次 AI 调用会自动拉起新版服务。

---

## 给开发者看

以下内容供开发、排查问题的人参考。

### 完整工具清单

| 工具 | 用途 |
| --- | --- |
| `jsd_ping` | 检查插件是否在线 |
| `jsd_get_selection` | 读取画布当前选中的节点 |
| `jsd_create_nodes` | 按描述创建节点(frame/rect/text 等,支持阴影/描边/渐变/文本样式) |
| `jsd_create_svg` | 直接导入 SVG 字符串(保留 path/矢量数据,不经降级) |
| `jsd_html_to_design` | 把 HTML 转成设计节点 |
| `jsd_update_selection` | 修改选中节点的属性(位置/颜色/文字/圆角等) |
| `jsd_find` | 按名称/类型查找节点 |
| `jsd_manage_nodes` | 节点结构操作,op 含 select/remove/clone/group/ungroup/flatten/outline_stroke/reparent/repair(清理引擎残留失效节点) |
| `jsd_manage_components` | 组件/实例操作,op 含 create_component(建空壳,子节点用 reparent 归入)/create_instance/detach_instance/import_component/swap_component/set_instance_properties/combine_as_variants |
| `jsd_export` | 导出节点为 PNG/JPG/SVG/PDF |
| `jsd_list_fonts` | 列出可用字体 |
| `jsd_fill_image` | 用本地图片填充节点 |

### 工作原理(简版)

- 一个常驻的轻量服务负责和插件通信,连接即时设计里的插件
- 每个 AI 会话会自动连上这个服务;会话关掉不影响插件
- 服务常驻;更新版本时自动替换,无需手动清理(旧版首次升级除外,见「升级」)
- 多个会话可以同时用,共享同一个插件连接

### 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `TEXT_TO_DESIGN_MCP_PORT` | `47812` | 与插件通信的端口(被占用会启动失败) |
| `TEXT_TO_DESIGN_MCP_HTTP_PORT` | `47820` | 内部服务端口(一般不用动) |
| `TEXT_TO_DESIGN_MCP_LOG` | `/tmp/text-to-design-mcp.log` | 日志文件路径 |
| `TEXT_TO_DESIGN_MCP_LOG_LEVEL` | `info` | 日志级别:`debug`/`info`/`warn`/`error` |

### 日志排查

- 看日志:`tail -f /tmp/text-to-design-mcp.log`(请求/响应耗时、HTTP 状态码、插件连接、二进制组装都会记)
- 要更细的连接日志,启动时设 `TEXT_TO_DESIGN_MCP_LOG_LEVEL=debug`(默认 info)
- 插件面板自带连接状态和日志,也能帮定位

### 构建与开发

```bash
pnpm install
pnpm dev        # watch 构建 ui/code
pnpm mcp        # 开发态启动后台服务(tsx 直跑)
```
