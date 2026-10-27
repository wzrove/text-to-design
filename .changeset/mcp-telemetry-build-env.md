---
"text-to-design-mcp": patch
---

遥测上报的 endpoint/key 改为构建期从包内 .env 注入(vite loadEnv + define):真值不进 git、只进 dist;未注入则上报整体关闭;运行时 env 仍可覆盖
