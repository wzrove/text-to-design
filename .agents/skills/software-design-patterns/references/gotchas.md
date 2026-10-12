# 模式分辨（两个候选挑哪个）

路由表回答「什么压力配什么模式」，本文回答「候选里两个长得像的挑哪个」。模式选错，多半不是不会用，是没分清两个同名不同物或形似的。

## 同名不同物

- `enterprise/repository.md` 和 `ddd/repository.md`：判断依据是有没有聚合根，不是有没有数据库表。前者服务 CRUD 和查询封装，后者按聚合根取存、服务富领域模型。选错的话 ORM 类型会渗进领域层。
- `ddd/aggregate.md` 和 `ddd/aggregate-root.md`：一件事的两面，前者讲一致性边界划在哪，后者讲对外入口是谁。路由表里的 `Aggregate + Aggregate Root` 是一行，别当两个模式推荐出去。
- `gof/creational/factory-method.md` 和 `ddd/factory.md`：前者决定创建哪个实现，后者管「创建本身带领域规则、一出生就得有效」。领域工厂不是所有 `new` 的入口。

## 两个候选挑哪个

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

## 一句话纠偏

- Outbox 只保证至少一次投递，不保证 exactly-once。
- CQRS 与 Event Sourcing 不绑定，可以各用各的。
- Singleton 优先用 DI 容器作用域，手写静态 `getInstance` 等于藏了个全局状态。
- 适配层不做业务编排，多做会变成第二个服务层。
- 超时先于重试，多层无预算重试会放大流量。
- 组合落地的不变量（一次提交一个本地事务、读模型可重建、租约带 fencing token）见 [常见模式组合](pattern-combinations.md)。
