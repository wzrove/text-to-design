---
"text-to-design-mcp": patch
"text-to-design-ui": patch
---

错误与日志统一结构化:LogRecord(level/scope/message/code?/subject?)成为落盘、面板推送与遥测上报共用的形状;遥测按 (user_id, fingerprint) 跨窗口 rollup,message 降为 detail;落盘日志改 JSONL
