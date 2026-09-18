---
name: software-design-patterns
description: Use when code structure is under pressure — growing if/switch branches, scattered status checks, tight coupling to third-party SDKs, unclear layering or transaction boundaries, extensibility demands, domain modeling, or cross-service reliability (dual writes, retries, sagas, idempotency). Guides selecting, rejecting, and combining GoF, enterprise, DDD, and distributed-system patterns by evidence, and recommends keeping the code simple when the pressure is unproven. Trigger on 重构、解耦、架构评审、扩展点、状态机、双写一致性、重试熔断、CQRS requests even if the user never says "设计模式".
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
2. **说清压力**：指出条件分支、耦合、职责、状态、事务、一致性或可靠性上的具体问题。
3. **路由**：用下方「快速路由」表筛出 **最多 3 个候选**。若命中「停止条件」，直接建议保持简单，**不再读任何参考文件**。
4. **验证候选**：打开候选模式文件，只看 `什么时候使用` / `什么时候不要使用` / `常见误用` / `退出条件`。
5. **组合检查**：推荐 2 个及以上模式时，读 [常见模式组合](references/pattern-combinations.md)，确认职责不重叠、故障链可解释。
6. **输出**：按「输出模板」给结论。
7. **落日志**：把结论写入设计决策日志。不是可选项——没有记录的决策等于下次需求变更时重新猜。

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

## 输出模板

```markdown
## 压力
<具体代码/架构压力；变化频率、失败后果、当前已产生的成本>

## 结论
<主模式>（必要时：<辅助模式>），或明确写「不引入模式，保持 <更简单的做法>」

记录：<docs/design-decisions/NNNN.md>（本次是新建 / 追加 / 取代 / 废弃）

## 理由与排除
- 命中信号：<可观察证据，不是"最佳实践">
- 排除 <最相近候选>：<为什么>

## 最小落地
角色 / 接口所在层 / 创建与装配位置 / 一次请求或消息的调用时序

## 成本与退出条件
<新增间接层、状态、网络跳数、存储、运维负担>；<需求规模下降或假设不成立时如何回退>

## 验证
<不变量测试、边界/并发/重试用例、需要打的指标与日志>
```

异步模式（事件、Outbox、Saga、CQRS、重试）必须在「验证」里写明重复、乱序和恢复策略。

## 设计决策日志（可迭代）

设计结论必须沉淀成记录，随需求变更演进。历史只增不改：旧记录保留，靠状态和「变更历史」表达演进。

**位置**：优先沿用项目已有约定（`docs/adr/`、`docs/decisions/`、`ADR/`、已有设计日志）；都没有则用 `docs/design-decisions/`，索引为 `INDEX.md`。

**创建记录**：

```bash
python3 scripts/new_decision.py "支付渠道分支改用 Strategy"          # 自动编号 + 更新索引
python3 scripts/new_decision.py "订单状态机改用 State" --supersedes 0001
```

脚本从 [assets/decision-record-template.md](assets/decision-record-template.md) 生成骨架（压力 / 候选与排除 / 结论 / 最小落地 / 成本与退出条件 / 验证 / 变更历史），填内容即可。编号永不复用，不覆盖已有文件。

**需求变更时的三种动作**：

| 情况 | 动作 |
|---|---|
| 结论不变，只是约束/规模变化 | 在原记录「变更历史」追加一行：日期、需求变更、结论是否变 |
| 结论变了 | 新建记录并 `--supersedes <原编号>`；原记录状态改为「已被取代」，保留原文 |
| 命中原记录的「退出条件」 | 原记录状态改为「已废弃」，新建记录写明回退方案与回退后的更简单设计 |

**复盘触发**：每次需求变更后，重扫相关记录的「退出条件」。命中就回退，不要因为已经实现过就继续保留模式。**禁止**删除或静默覆盖旧记录，也禁止只改结论不写理由。

## 采纳前自检

输出建议前确认：

- [ ] 压力是真实的（已有 ≥2 个实现/分支，或已产生回归），不是"未来可能"。
- [ ] 已比较至少一个相近候选并说明排除理由。
- [ ] 更简单方案（函数、参数、组合、平台能力）已被明确排除。
- [ ] 团队能测试和观测新增间接层；异步模式已说明重复/乱序/恢复。
- [ ] 结论已落入设计决策日志：新建记录，或在既有记录上追加变更/取代/废弃。

任一项未通过 → 回到「停止条件」，优先保持简单。

## 模式索引

### GoF / 创建型

- [Singleton](references/gof/creational/singleton.md) · [Factory Method](references/gof/creational/factory-method.md) · [Abstract Factory](references/gof/creational/abstract-factory.md) · [Builder](references/gof/creational/builder.md) · [Prototype](references/gof/creational/prototype.md)

### GoF / 结构型

- [Adapter](references/gof/structural/adapter.md) · [Bridge](references/gof/structural/bridge.md) · [Composite](references/gof/structural/composite.md) · [Decorator](references/gof/structural/decorator.md) · [Facade](references/gof/structural/facade.md) · [Flyweight](references/gof/structural/flyweight.md) · [Proxy](references/gof/structural/proxy.md)

### GoF / 行为型

- [Chain of Responsibility](references/gof/behavioral/chain-of-responsibility.md) · [Command](references/gof/behavioral/command.md) · [Interpreter](references/gof/behavioral/interpreter.md) · [Iterator](references/gof/behavioral/iterator.md) · [Mediator](references/gof/behavioral/mediator.md) · [Memento](references/gof/behavioral/memento.md) · [Observer](references/gof/behavioral/observer.md) · [State](references/gof/behavioral/state.md) · [Strategy](references/gof/behavioral/strategy.md) · [Template Method](references/gof/behavioral/template-method.md) · [Visitor](references/gof/behavioral/visitor.md)

### 企业应用模式

- [Repository](references/enterprise/repository.md) · [Service Layer](references/enterprise/service-layer.md) · [Unit of Work](references/enterprise/unit-of-work.md) · [Data Mapper](references/enterprise/data-mapper.md) · [Active Record](references/enterprise/active-record.md) · [DTO](references/enterprise/dto.md) · [Dependency Injection](references/enterprise/dependency-injection.md) · [MVC](references/enterprise/mvc.md)

### DDD 模式

- [Entity](references/ddd/entity.md) · [Value Object](references/ddd/value-object.md) · [Aggregate](references/ddd/aggregate.md) · [Aggregate Root](references/ddd/aggregate-root.md) · [DDD Repository](references/ddd/repository.md) · [Domain Service](references/ddd/domain-service.md) · [Domain Event](references/ddd/domain-event.md) · [Application Service](references/ddd/application-service.md) · [DDD Factory](references/ddd/factory.md) · [Specification](references/ddd/specification.md)

### 分布式系统模式

- [Saga](references/distributed/saga.md) · [CQRS](references/distributed/cqrs.md) · [Event Sourcing](references/distributed/event-sourcing.md) · [Transactional Outbox](references/distributed/outbox.md) · [Circuit Breaker](references/distributed/circuit-breaker.md) · [Retry](references/distributed/retry.md) · [Bulkhead](references/distributed/bulkhead.md) · [API Gateway](references/distributed/api-gateway.md) · [Service Discovery](references/distributed/service-discovery.md) · [Idempotency](references/distributed/idempotency.md) · [Leader Election](references/distributed/leader-election.md)
