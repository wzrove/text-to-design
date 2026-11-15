---
"text-to-design-ui": patch
---

fix(ui): 转发超时报错带本次入参摘要

只放标量与数组长度,用于区分 scope=document 全量加载 / ids 深读 / depth 过大三条
顶穿 25s 预算的分支;不展开内容,不把画布细节带出去。
