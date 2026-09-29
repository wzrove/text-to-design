---
name: software-design-patterns
description: Use when code structure is under pressure — growing if/switch branches, scattered status checks, tight coupling to third-party SDKs, unclear layering or transaction boundaries, extensibility demands, domain modeling, or cross-service reliability (dual writes, retries, sagas, idempotency). Guides selecting, rejecting, and combining GoF, enterprise, DDD, and distributed-system patterns by evidence, and recommends keeping the code simple when the pressure is unproven. Trigger on 重构、解耦、架构评审、扩展点、状态机、双写一致性、重试熔断、CQRS requests even if the user never says "设计模式" — and on 「同一个 bug 修完又复发」「报错横跨多层」这类结构压力伪装成缺陷的场景。
allowed-tools: Bash, Read, Grep, Glob, Write, Edit
---

# 软件设计模式：选择、拒绝与组合

参考文件是设计决策记录，不是名词解释。按「压力 → 候选 → 排除」推进，别从模式名反推需求。

## 核心原则

1. **先看什么在变**：变化频率多高？已经付出维护成本了吗？
2. **够用就别抽象**：一个普通的 `if`、几个函数、语言原生特性、简单组合能解决的，不引入模式。
3. **收益要能被验证**：降耦合、隔离变化、守住不变量、划清事务边界、提高可靠性或可测性，至少占一样。
4. **成本也得算进去**：多出来的接口、对象、间接调用、状态、异步、持久化，还有运维负担。
5. **别为「以后可能」设计**：变化有证据，或者结构已经疼了，才加抽象。

## 工作流

1. **先查日志**：项目里已经有设计决策日志的，先读索引，按模块或变化轴找到这次需求会影响的记录（机制见 [设计决策日志](references/decision-log.md)）。需求变更从这一步进，别从零重新判断。
   项目另有失败信号源的，把**复发**的那几条和既有记录的「影响范围」对一遍。用哪种信号源（报错台账、回归用例、线上告警、事故复盘）由项目自己定。**正在被现实证伪的决策优先处理**，它说明上一个结论要么假设不成立，要么退出条件已经命中。
2. **说清压力**：具体是条件分支、耦合、职责、状态、事务、一致性，还是可靠性上的问题。
3. **路由**：用下面的「快速路由」表筛出**最多 3 个候选**。命中「停止条件」就直接建议保持简单，**不要再读任何参考文件**。
4. **验证候选**：按 [模式索引](references/pattern-index.md) 单条打开候选，只看 `什么时候使用` / `什么时候不要使用` / `常见误用` / `退出条件` 四段。
5. **组合检查**：要推荐 2 个及以上模式，就读 [常见模式组合](references/pattern-combinations.md)，确认职责不重叠、故障链解释得通。
6. **输出**：按 [输出模板](references/output-template.md) 给结论。
7. **落日志**：把结论写进设计决策日志（机制见 [设计决策日志](references/decision-log.md)）。这一步不做不行，没有记录的决策，下次需求变更时只能重新猜。

**只在**路由表没命中、问题跨了多个层级、或者需要评分和迁移顺序时，才读 [设计模式决策指南](references/decision-guide.md)。

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
| 网络瞬态失败 | Retry（超时预算见 retry.md） | 永久错误、非幂等写 |
| 持续故障导致资源耗尽 | Circuit Breaker + Bulkhead | 本地廉价调用 |
| 跨服务长事务 | Saga | 单库 ACID 足够 |
| 写模型复杂、读模型差异大 | CQRS | 普通 CRUD |
| 需要完整事实历史/重放 | Event Sourcing | 只为审计日志 |
| 重复请求/消息不能重复副作用 | Idempotency | 天然幂等读操作 |

## 停止条件：保持简单

下面任意一条成立，就推荐「不使用模式」：

- 只有一个实现，也没证据说以后会变。
- 分支不多、稳定、一眼能读懂，抽象之后跳转成本比收益还高。
- 新模式要带进状态、异步或持久化，可项目根本没有对应的可靠性、一致性需求。
- 团队测不了、看不见、也运维不动这个模式（Event Sourcing、Saga、复杂事件流都算）。
- 语言或框架本来就有：命名参数、DI 容器作用域、平台服务发现、K8s Service。
- 根因在职责划分或者数据模型，那就先修边界，别拿模式把问题盖住。
- 只为了消掉一个又小又稳定的 `if`，引进来一堆接口和类。别把模式数量当质量指标。

## 边界：本技能不判门槛

本技能只负责「**已经确认的结构压力 → 决策**」这一段，**不假设项目用哪套缺陷跟踪**。什么算结构压力、什么时候该走这一步，由**调用方**说了算。不同项目用的是报错台账、回归用例、事故复盘还是评审意见，本技能不关心，也不引用任何具体工具。

产出固定这几样：结论、候选与排除、实施方案（目标形状 + 本次不做）、成本与退出条件，外加一个编号 `NNNN`。

**别给琐碎改动开决策记录。** 日志一旦被小条目灌满，工作流第 1 步「先查日志」就成了噪音源，整条链路跟着失效。

## Gotchas

模式选错，多半不是不会用，是没分清两个长得像的。路由表回答「什么压力配什么模式」，
下面这张表回答「两个候选挑哪个」。

**同名不同物**

- `enterprise/repository.md` 和 `ddd/repository.md`：判断依据是有没有聚合根，不是有没有数据库表。前者服务 CRUD 和查询封装，后者按聚合根取存、服务富领域模型。选错的话 ORM 类型会渗进领域层。
- `ddd/aggregate.md` 和 `ddd/aggregate-root.md`：一件事的两面，前者讲一致性边界划在哪，后者讲对外入口是谁。路由表里的 `Aggregate + Aggregate Root` 是一行，别当两个模式推荐出去。
- `gof/creational/factory-method.md` 和 `ddd/factory.md`：前者决定创建哪个实现，后者管「创建本身带领域规则、一出生就得有效」。领域工厂不是所有 `new` 的入口。

**两个候选挑哪个**

| 容易混 | 怎么分 |
|---|---|
| Strategy / Template Method | 整个算法在变用 Strategy；固定流程里某几步在变用 Template Method |
| Strategy / State | 调用方或注册表挑、策略之间互不感知是 Strategy；状态对象自己触发迁移、约束合法转换是 State |
| Decorator / Proxy | 调用方知道包装存在是 Decorator；真实对象对它不可见是 Proxy，管权限、事务、懒加载、远程替身 |
| Adapter / Proxy | 接口本来不兼容、要做类型或协议转换是 Adapter；接口一致、只是控制访问是 Proxy |
| Builder / Factory Method | 痛点在参数多、构造要分阶段用 Builder；痛点在要选不同实现用 Factory Method |
| Abstract Factory / Factory Method | 成套切产品族用 Abstract Factory；只切一种产品用 Factory Method |
| Command / Domain Event | 请求执行是 Command，附带失败和所有权问题；已发生的事实是 Domain Event |
| Entity / Value Object | 看业务生命周期。有稳定身份是 Entity，只由值决定、可互换是 Value Object |
| Active Record / Data Mapper | CRUD 为主、事务简单用 Active Record；规则一复杂或要用多个存储，换 Data Mapper + Repository |
| Application Service / Service Layer / Domain Service | 用例编排和事务边界归前两个；一条规则同时依赖多个聚合、放进哪个实体都算归属错误，才用 Domain Service |
| Outbox / Idempotency | Outbox 管消息一定发得出去；Idempotency 管重复了不产生额外副作用 |
| Saga 补偿 / 数据库 rollback | 补偿是新的业务动作，本身也会失败，要给它重试、可观测和人工兜底 |

**一句话纠偏**

- Outbox 只保证至少一次投递，不保证 exactly-once。
- CQRS 与 Event Sourcing 不绑定，可以各用各的。
- Singleton 优先用 DI 容器作用域，手写静态 `getInstance` 等于藏了个全局状态。
- 适配层不做业务编排，多做会变成第二个服务层。
- 超时先于重试，多层无预算重试会放大流量。
- 组合落地的不变量（一次提交一个本地事务、读模型可重建、租约带 fencing token）见 [常见模式组合](references/pattern-combinations.md)。

## 参考文件（按需加载）

| 何时读 | 文件 |
| --- | --- |
| 候选定了，要核对单个模式的适用性 / 误用 / 退出条件 | `references/pattern-index.md`（52 条索引，**单条打开**） |
| 输出结论、采纳前自检 | `references/output-template.md` |
| 落记录、需求变更时追加/取代/废弃、索引体积治理 | `references/decision-log.md` |
| 推荐 ≥2 个模式，要确认职责不重叠 | `references/pattern-combinations.md` |
| 路由未命中、跨多层级、要评分或迁移顺序 | `references/decision-guide.md` |
| 新建决策记录骨架（自动编号 + 更新索引），或改既有记录状态 | `scripts/new_decision.py "标题"` / `--status <编号> 已采纳`（骨架来自 `assets/decision-record-template.md`） |

> 52 个模式文件加起来远超一次对话的预算：**只打开候选那 1–3 个**。
> 模式文件里没有 `Timeout` 这一条。超时预算是 `distributed/retry.md` 里的约束，不要去找 `timeout.md`。
