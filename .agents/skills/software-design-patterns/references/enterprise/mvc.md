# 模型-视图-控制器模式（Model-View-Controller）

**类别：** 企业应用模式

## 意图

分离用户输入、业务/状态模型和呈现，降低 UI 变化对业务逻辑的影响。

## 什么时候使用

- 交互式应用有清晰 UI 与业务分离需求。
- Web 框架以 Controller/View/Model 组织。
- 多种视图共享业务模型。

## 什么时候不要使用

- 后端纯 API 不一定需要 View 概念。
- 简单页面过度分层反而增加模板。
- 把 Controller 当业务服务。

## 识别信号

- Controller 接收输入
- View 渲染
- Model 管状态/业务

## 实现要点

- Controller 保持薄。
- 业务逻辑放领域/应用层。
- View 不直接访问持久化。

## 常见误用

- 胖 Controller。
- Model 概念含混，把 DTO/Entity/Domain 都叫 Model。

## 常见组合

- Service Layer
- DTO

## 最小示意

```text
HTTP -> Controller -> Application Service -> View/Response
```

## 深度分析

### 变化压力
MVC 的价值在于把输入路由、状态/业务和呈现分开，避免 UI 改动牵连事务规则。它描述协作边界，不规定所有项目必须有三个大目录。

### 结构与协作
Controller 解析输入、调用 Application/Service 并选择 View/Response；Model 可以是领域模型或页面状态，但要明确命名；View 只负责呈现和用户交互，不直接访问数据库。API-only 服务通常只有 Controller + Service + DTO。

### 关键权衡与替代
分层便于替换 UI 和测试，代价是跳转和映射。组件化前端可用 Presenter/ViewModel；简单页面可采用单文件处理器。胖 Controller、含 SQL 的 View 和含业务规则的模板都是边界失效信号。

### 落地与验证
先画一次请求时序和数据 ownership，再把一个 Controller 的数据库调用移入 Service。测试从 HTTP/事件输入到响应的组件或集成流程，验证状态码、模板数据和错误页面；指标记录路由耗时而非内部对象细节。按用例拆 Controller，避免按数据库表拆。

## 退出条件

当框架已提供更清晰的组件/handler 模型，或页面没有独立呈现层时，采用对应架构术语并删除空壳 MVC 层。
