# 领导者选举模式（Leader Election）

**类别：** 分布式系统模式

## 意图

在多个实例中选出一个临时领导者执行需要单活的协调任务。

## 什么时候使用

- 定时任务/协调任务只能由一个实例执行。
- 需要主节点负责分片、调度或维护租约。
- 平台已有可靠 lease/lock 原语。

## 什么时候不要使用

- 业务本可设计为幂等并允许并行执行。
- 只在单实例部署。
- 用数据库永久锁代替带租约选举而没有故障恢复。

## 识别信号

- scheduler 单活
- lease/heartbeat
- 主备切换

## 实现要点

- 使用带 TTL/lease 的一致性存储。
- 处理领导权丢失和 fencing token。
- 不要假设“当选后永远是 leader”。

## 常见误用

- 脑裂。
- 无 fencing 导致旧 leader 继续写。
- 把 leader 当长期静态配置。

## 常见组合

- Idempotency
- Service Discovery

## 最小示意

```text
acquireLease(); while leaseValid: runCoordinator()
```

## 深度分析

### 变化压力
Leader Election 只适合“同一时刻必须单活”的协调任务，如分片调度或维护作业；能设计成幂等并行时，优先不要选举。进程内 Singleton 不能提供跨实例唯一性。

### 结构与协作
实例通过带 TTL 的 lease/lock 竞争，续租失败立即停止写入；当选者携带递增 fencing token 写资源，存储端拒绝旧 token。任务状态、接管和重试必须可恢复，不能依赖 leader 永不重启。

### 关键权衡与替代
选举提高单活安全性，但引入时钟/租约、脑裂和接管延迟。若平台已有 Kubernetes Lease、数据库 advisory lock 或队列消费组，应复用其语义；若任务允许重复，幂等 + 分布式队列通常更简单。

### 落地与验证
先定义 lease 持有者、TTL、续租窗口、fencing 存储和停止路径。测试网络分区、GC 暂停、续租失败、双 leader 写入、接管和旧 token 拒绝；监控 lease age、renew latency、leader changes、fenced writes。演练故障时确保旧实例无法继续副作用。

## 退出条件

当任务可以安全并行或平台提供透明单活调度时，移除自建选举。
