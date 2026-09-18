# 数据映射器模式（Data Mapper）

**类别：** 企业应用模式

## 意图

在领域对象和数据库记录之间独立完成映射，使领域模型不知道持久化细节。

## 什么时候使用

- 富领域模型需要保持 persistence ignorance。
- 数据库模型与领域模型结构不同。
- ORM/Mapper 层可集中处理映射。

## 什么时候不要使用

- 简单 CRUD 且 Active Record 更直接。
- 映射成本远大于领域收益。

## 识别信号

- 领域类无 ORM 注解
- DB schema 与 domain model 不同
- mapper/ORM session

## 实现要点

- 映射逻辑放基础设施层。
- 避免把数据库 null/enum/时间语义泄漏到领域。
- 对复杂查询可使用独立读模型。

## 常见误用

- 双向映射丢失字段。
- 为了纯净模型创建大量无价值 DTO。
- N+1 问题被 Mapper 隐藏。

## 常见组合

- Repository
- Unit of Work

## 最小示意

```text
OrderMapper.toDomain(row) / toRow(order)
```

## 深度分析

### 变化压力
Data Mapper 用映射层隔离领域对象和数据库模型，适用于 schema 与领域概念不一致、需要 persistence ignorance 或多种存储的系统。它解决的是模型边界，不是自动提升性能。

### 结构与协作
Mapper 负责行/文档与领域对象的双向转换、默认值、枚举、时区和版本字段；Repository 负责访问集合，UoW 负责事务。映射失败应转换为明确的持久化错误，不能把 ORM 实体泄漏给领域。

### 关键权衡与替代
隔离带来纯净模型和可演进 schema，代价是双向代码、字段遗漏和 N+1 风险。简单 CRUD 可用 Active Record；若只有少量字段差异，局部转换函数比完整 mapper 更经济。读侧可直接投影到 DTO，不必重建聚合。

### 落地与验证
建立领域字段—存储字段映射表，先迁移一个聚合并保留 golden fixture。测试 round-trip、旧 schema、null/时区/精度、乐观锁和批量加载；监控 N+1、映射耗时和丢弃字段。任何新增字段先更新契约测试再改 mapper。

## 退出条件

当领域模型与存储模型长期同构且无隔离收益时，合并 mapper 或回到框架 ORM。
