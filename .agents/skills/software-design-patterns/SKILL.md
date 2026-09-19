---
name: software-design-patterns
description: Use when code structure is under pressure — growing if/switch branches, scattered status checks, tight coupling to third-party SDKs, unclear layering or transaction boundaries, extensibility demands, domain modeling, or cross-service reliability (dual writes, retries, sagas, idempotency). Guides selecting, rejecting, and combining GoF, enterprise, DDD, and distributed-system patterns by evidence, and recommends keeping the code simple when the pressure is unproven. Trigger on 重构、解耦、架构评审、扩展点、状态机、双写一致性、重试熔断、CQRS requests even if the user never says "设计模式" — and on 「同一个 bug 修完又复发」「报错横跨多层」这类结构压力伪装成缺陷的场景。
---

# 软件设计模式：选择、拒绝与组合

参考文件是设计决策记录，不是名词解释。按"压力 → 候选 → 排除"推进，不要从模式名反推需求。

## 核心原则

1. **先识别变化点**：什么在变？变化频率？是否已产生维护成本？
2. **最小复杂度优先**：简单分支、普通函数、组合、语言原生特性够用时不引入模式。
3. **收益必须可验证**：降耦合、隔离变化、维护不变量、明确事务边界、提可靠性或可测性。
4. **成本必须计入**：接口、对象、间接调用、状态、异步、持久化、运维。
5. **不为"未来可能"设计**：只有变化有证据或结构已产生压力时才加抽象。

## 工作流

1. **先查日志**：若项目已有设计决策日志，读索引，按模块/变化轴定位受影响的既有记录（见「设计决策日志」）。需求变更时从这一步开始，不要重新从零判断。
   **再查现实**：项目若另有失败信号源（报错台账、回归用例、线上告警、事故复盘 —— 是哪一种由项目决定），
   先看有没有**复发**落在既有记录的「影响范围」内 —— **正在被现实证伪的决策优先级最高**，
   它说明上一个结论要么假设不成立、要么退出条件已命中。
2. **说清压力**：指出条件分支、耦合、职责、状态、事务、一致性或可靠性上的具体问题。
3. **路由**：用下方「快速路由」表筛出 **最多 3 个候选**。若命中「停止条件」，直接建议保持简单，**不再读任何参考文件**。
4. **验证候选**：按 [模式索引](references/pattern-index.md) 单条打开候选，只看 `什么时候使用` / `什么时候不要使用` / `常见误用` / `退出条件`。
5. **组合检查**：推荐 2 个及以上模式时，读 [常见模式组合](references/pattern-combinations.md)，确认职责不重叠、故障链可解释。
6. **输出**：按 [输出模板](references/output-template.md) 给结论。
7. **落日志**：把结论写入设计决策日志（机制见 [设计决策日志](references/decision-log.md)）。不是可选项——没有记录的决策等于下次需求变更时重新猜。

**只在**路由表未命中、问题跨多个层级、或需要评分/迁移顺序时，才读 [设计模式决策指南](references/decision-guide.md)。

## 快速路由

| 设计压力 | 首选候选 | 通常不该用的情况 |
|---|---|---|
| `if/switch(type)` 随实现数量增长 | Strategy + Factory Method | 分支少且稳定 |
| `if/switch(status)` 散落 | State | 状态仅是数据标签 |
| 固定流程中少数步骤变化 | Template Method | 变化维度多、组合需求强 |
| 连续规则/过滤且可短路 | Chain of Responsibility | 步骤强耦合、全部必须执行 |
| 一个事实触发多个反应 | Observer / Domain Event | 强一致动作必须同事务完成 |
| 第三方/遗留接口不兼容 | Adapter | 接口本来就兼容 |
| 横切访问控制、事务、远程替身 | Proxy | 只是动态叠加功能时更像 Decorator |
| 功能可按需层层增强 | Decorator | 包装顺序复杂到难以理解 |
| 两个正交变化维度导致类爆炸 | Bridge | 只有一个变化维度 |
| 创建参数多、构造分阶段 | Builder | 简单构造/命名参数已足够 |
| 需要成套切换产品族 | Abstract Factory | 只有一种产品 |
| 复杂子系统需要统一入口 | Facade | Facade 只是无价值转发 |
| 树形结构统一处理叶子/容器 | Composite | 实际是图或行为差异巨大 |
| 领域对象需要稳定身份 | Entity | 只由值决定时用 Value Object |
| 领域对象只由值决定 | Value Object | 有独立身份/生命周期 |
| 强一致对象组需要事务边界 | Aggregate + Aggregate Root | 只是数据库关联关系 |
| 领域规则不自然属于实体 | Domain Service | 只是应用编排或技术服务 |
| 聚合持久化需要隔离 ORM | DDD Repository | 简单 CRUD 或报表查询 |
| 集合式持久化访问抽象 | Enterprise Repository | 富领域模型应按聚合根建模 |
| DB 更新 + MQ 发布双写 | Outbox | 没有跨进程事件传播 |
| 网络瞬态失败 | Retry + Timeout | 永久错误、非幂等写 |
| 持续故障导致资源耗尽 | Circuit Breaker + Bulkhead | 本地廉价调用 |
| 跨服务长事务 | Saga | 单库 ACID 足够 |
| 写模型复杂、读模型差异大 | CQRS | 普通 CRUD |
| 需要完整事实历史/重放 | Event Sourcing | 只为审计日志 |
| 重复请求/消息不能重复副作用 | Idempotency | 天然幂等读操作 |

## 停止条件：保持简单

命中任一条件时推荐"不使用模式"：

- 只有一个实现，且未来变化无证据。
- 分支少、稳定、可读，抽象后跳转成本高于收益。
- 新模式引入状态/异步/持久化复杂度，但无对应可靠性或一致性需求。
- 团队无法测试、观测或运维该模式（Event Sourcing、Saga、复杂事件流）。
- 语言或框架已有原生能力：命名参数、DI 容器作用域、平台服务发现、K8s Service。
- 根因是职责划分或数据模型错误——先修边界，不要用模式掩盖。
- 为了消除一个很小很稳定的 `if` 引入多个接口和类；把模式数量当质量指标。

## 边界：本技能不判门槛

本技能只做「**已确认的结构压力 → 决策**」这一段，**不假设项目用哪套缺陷跟踪** ——
什么算结构压力、什么时候该走这一步，由**调用方**判定（不同项目用的是报错台账、回归用例、
事故复盘还是评审意见，本技能不关心是哪种，也不引用任何具体工具）。产出固定为：
结论 + 候选与排除 + 最小落地 + 成本与退出条件 + 编号 `NNNN`。

**不要给琐碎改动开决策记录** —— 日志一旦被小条目灌满，工作流第 1 步「先查日志」就变成噪音源，
整条链路失效。

## Gotchas

- **同名不同物**：`enterprise/repository.md` 是集合式持久化抽象（适合 CRUD/查询封装），`ddd/repository.md` 是聚合根级仓储（富领域模型、强事务边界）。选错会让 ORM 类型渗进领域层。
- **Strategy vs State**：Strategy 由调用方/注册表选择，策略之间互不感知；State 由状态对象自己触发迁移并约束合法转换。
- **Decorator vs Proxy**：Decorator 动态叠加职责、调用方知道包装存在；Proxy 控制访问（权限、事务、懒加载、远程替身），真实对象对调用方不可见。
- **Outbox ≠ exactly-once**：只保证至少一次投递，消费端必须按业务键幂等。
- **Saga 补偿 ≠ rollback**：补偿是另一个业务动作，本身会失败，需要重试、可观测和人工兜底。
- **CQRS 与 Event Sourcing 不绑定**：可各自独立采用，不要默认成对引入。
- **Singleton 优先用 DI 容器作用域**，不要手写全局静态实例——那是隐藏的全局状态和测试难题。
- **Adapter 不负责业务编排**：适配层只做类型/协议转换，否则会变成第二个服务层。
- **超时先于重试**：多层无预算重试会放大流量，必须有总预算和退避上限。

## 参考文件（按需加载）

| 何时读 | 文件 |
| --- | --- |
| 候选定了，要核对单个模式的适用性 / 误用 / 退出条件 | `references/pattern-index.md`（60 条索引，**单条打开**） |
| 输出结论、采纳前自检 | `references/output-template.md` |
| 落记录、需求变更时追加/取代/废弃、索引体积治理 | `references/decision-log.md` |
| 推荐 ≥2 个模式，要确认职责不重叠 | `references/pattern-combinations.md` |
| 路由未命中、跨多层级、要评分或迁移顺序 | `references/decision-guide.md` |

> 60 个模式文件加起来远超一次对话的预算：**只打开候选那 1–3 个**。
