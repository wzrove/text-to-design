---
"text-to-design-mcp": patch
---

遥测密钥统一为 TELEMETRY_API_KEY:客户端不再读 TEXT_TO_DESIGN_TELEMETRY_KEY,与服务端共用同一个变量名 —— 此前两端各持一份值,Error 上报会因密钥错位全线 401。端点仍叫 TEXT_TO_DESIGN_TELEMETRY_URL。

daemon 轮换改为先判产物是否真陈旧:shim 重启只说明宿主重连,不再无条件请常驻 daemon 退役,修复宿主抖动时 MCP 面永久 disconnected。
