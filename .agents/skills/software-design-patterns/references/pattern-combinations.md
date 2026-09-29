# 常见模式组合

> 何时读：SKILL.md 工作流第 5 步，候选已定、要推荐 2 个及以上模式，需要确认职责不重叠、
> 故障链解释得通时。**组合不是升级理由**。先进「停止条件」，主压力被证实了才看本页；
> 本页是候选之后的核对清单，不是需求入口，从这里反推需求必然堆叠。

模式很少单独出现。先看职责怎么组合，别机械堆叠。

> 本页只写**组合特有**的约束（谁拥有谁、故障链怎么走）。通用纠偏（Outbox ≠ exactly-once、
> CQRS 与 Event Sourcing 不绑定、超时先于重试）见 SKILL.md 的 Gotchas，那里是单一来源。
> 两处表述不一致时，以 SKILL.md 为准，并回来改本页。

## Strategy + Factory Method

**适用：** 多种算法/渠道 + 运行时选择实现。Factory 负责选择/创建，Strategy 负责算法本身。

**不要：** 让 Factory 顺便执行策略业务；也不要让调用方用了 Factory 又再 `switch(type)` 一次。

## Adapter + Dependency Injection

**适用：** 外部供应商接口适配成内部端口，再由 DI 注入具体 Adapter。

**不要：** 把第三方 SDK 类型暴露给领域层。

## DDD Repository + Unit of Work + Data Mapper

**适用：** 富领域模型、本地 ACID 事务。Repository 负责聚合访问，Data Mapper 负责映射，UoW 负责一次用例的提交。

**这里的 Repository 指 `ddd/repository.md`**（有聚合根、按聚合取存）。没有聚合根、只做查询和 CRUD 封装的是 `enterprise/repository.md`，判断依据见 SKILL.md Gotchas 的「同名不同物」，别混用。

**不要：** 每个 Repository 私自 commit；也别用这组模式去解决跨服务事务。

## Aggregate + Domain Event + DDD Repository

**适用：** DDD 写模型。Aggregate 划一致性边界，Aggregate Root 是它的对外入口并维护不变量，通过 DDD Repository 持久化，并产生 Domain Event。（Aggregate 和 Aggregate Root 是一件事的两面，对外只算一个模式，别当两个推荐出去）

**不要：** 用事件去完成聚合内部必须立即满足的强一致规则。

## Domain Event + Outbox + Idempotency

**适用：** 可靠跨进程事件传播。事务内写 Outbox，异步发布；消费者按 event/business key 幂等。

**不要：** 以为 Outbox 就等于 exactly-once。

## Retry + Circuit Breaker + Bulkhead + Timeout

**适用：** 远程调用韧性。Timeout 限制单次等待；Retry 处理瞬态故障；Circuit Breaker 对持续故障快速失败；Bulkhead 隔离资源。
Timeout 不是独立模式文件，它的预算约束读 [Retry](distributed/retry.md)。

**不要：** 多层无限重试，或者对非幂等写盲目重试。

## Saga + Outbox + Idempotency

**适用：** 跨服务业务事务。Saga 组织步骤/补偿，Outbox 可靠发布，Idempotency 应对重复消息和重试。

**不要：** 把补偿当数据库 rollback；补偿本身也可能失败。

## CQRS + Event Sourcing

**适用：** 写侧复杂、需要事件事实源和多读模型时，可以组合使用。

**不要：** 把两者当成绑定关系。CQRS 可以不用 Event Sourcing，Event Sourcing 也不要求搞一套复杂双库 CQRS。

## Command + Memento

**适用：** 编辑器、工作台这类需要操作对象化 + undo/redo 的场景。

**不要：** 对无法逆转的外部副作用假装可以简单 undo。

## Composite + Visitor

**适用：** 稳定的树形结构上持续增加新操作，比如 AST 分析、打印、优化。

**不要：** 节点类型频繁增加时，Visitor 的修改成本会很高。

## 组合落地时的顺序与不变量

多个模式同时出现，按「边界先于机制」的顺序落地：

1. 先确定领域/应用边界和数据所有权（Aggregate、Service Layer、DDD Repository）。
2. 再隔离变化实现（Adapter、Strategy、Factory、Bridge、Decorator）。
3. 最后加跨进程可靠性（Outbox、Idempotency、Retry、Circuit Breaker、Saga）。

每加一个模式，都要回答三个问题：谁创建并拥有它、失败时谁负责恢复、怎么从指标或日志观察它。
常见的不变量有这些：

- **一次提交一个本地事务**：Repository 不私自提交，Outbox 与业务写入同事务。
- **至少一次不等于一次**：事件消费者和命令处理器必须按业务键幂等，并且能安全重放。
- **超时先于重试，重试受总预算约束**：避免多层重试形成流量放大。
- **读模型可重建**：CQRS 投影带版本和游标，重建不修改写侧事实源。
- **租约会失效**：Leader Election 的写入带 fencing token，旧 leader 不能继续提交。

组合后的调用链要是在一次故障演练里解释不清楚，先拆掉辅助模式，只留解决主压力的那一个。
