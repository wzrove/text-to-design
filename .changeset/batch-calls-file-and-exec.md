---
"text-to-design-mcp": minor
---

feat: 批量清单可落文件 —— `jsd_batch` 收 `callsFile`,新增 CLI `exec`

- `jsd_batch` 入参新增 `callsFile`(与 `calls` 二选一):给一个 JSON 文件的**绝对路径**,文件内容为 `{"calls":[…]}`(可带 `stopOnError` / `checkDrift`)或直接一个数组,两种形状等价(多一条形状就多一份事实要维护)。整页批量改造时入参里最占地方的是 id 数组(一份 `bindings` 上千个 node id),放进文件后 id 不必进上下文 —— 也就不必**逐字转写**(转写错一个就是静默漏改)。读文件有体积上限(`TEXT_TO_DESIGN_MCP_MAX_CALLS_FILE_BYTES`,默认 8 MB)、只收 JSON、步骤数仍受单批 50 步上限,失败一律点名(路径 / 体积 / 第几步 / 哪个字段错),不截断不猜。
- 新 CLI 子命令:`text-to-design-mcp exec <calls.json> [--json] [--dry-run]`。同一个文件形状,直接跑一次 `jsd_batch`;`--dry-run` 只校验清单不连 daemon,`--json` 把结果打成 JSON 供管道消费(计划与日志走 **stderr**,不污染 stdout),任一步失败退出码为 1。daemon 不在时按既有自检逻辑自己拉起 —— `spawnDaemon` 新增 `argvOverride`,exec 只把**入口路径**传过去,否则被拉起的 daemon 会带着 `exec` 子命令再跑一遍(递归)。
- 配方 `script-ops` 扩写「整页/整档批量改造」一节:先摸底、定策略前确认现状形态(有渐变/多色的节点不能一次绑整组)、id 的三种来源、按块切批、回读复核必须单独调一次 `jsd_find`(batch 回显会被裁剪到 id/name/type/几何)、清单装不下走文件或 CLI、点名类错误不重试。并明确一条边界:**不要去连 daemon 的本地端口或 import 本仓内部模块** —— 那是 shim↔daemon 的内部传输契约(端口可被 env 改、SDK 安装路径属 pnpm 私有结构),把它写进配方等于把内部契约公开化;做成子命令后对外契约只剩 CLI + JSON 形状。`jsd_batch` 描述(zh/en)与配方目录的 `whenToUse` 同步补指针。
- README 常见问题补一条「想用脚本批量改画布」的入口说明。

验证:typecheck 全绿;`vitest run` 的 recipe-resource / catalog-budget / instructions-routing / i18n 四组 35 个用例通过;真机(Figma)`exec` 跑通 `--dry-run` / 相对路径点名 / 文件不存在点名 / 自动拉起 daemon / 成功执行退出码 0 / 失败退出码 1 / `--json` 的 stdout 纯净;`callsFile` 三态验过(只给文件 → 2/2 成功;两个都给 → 点名拒;都缺省 → 点名拒)。
