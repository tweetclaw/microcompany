# Task Team Brief 与 Handoff Confirmation MVP 方案

**文档版本**: v1.0  
**创建日期**: 2026-04-29  
**项目**: MicroCompany  
**文档性质**: 多角色协作流程 MVP 补充方案

---

## 1. 背景

在第一阶段完成 Role Archetype、Prompt Snapshot 与基础 Handoff Confirmation 后，当前多角色 task 已经具备“能运行”的基础能力，但还缺少一个更清晰的任务内协作界面。

当前问题不是角色无法创建，而是角色在运行时仍然容易缺少以下共享认知：

- 当前 task 团队里到底有哪些真实成员
- 每个成员的大致职责是什么
- 当前激活角色是否应该继续推进，还是已经适合 handoff
- 如果要 handoff，下一位合法对象是谁
- handoff 是否应由系统自动执行，还是应由用户最终确认

这会导致两类体验问题：

1. 角色虽然有 archetype 和 prompt snapshot，但对“当前正在一个真实团队中工作”的感知仍然不够强
2. 即使模型判断适合交接，产品侧也缺少一个清晰、可控、面向用户确认的 handoff 界面

因此，本方案定义一个非常小的 MVP：

> **在 task 房间中增加只读的 Team Brief，并让 AI 在合适时机提出结构化 handoff 建议，由用户确认最终交接对象。**

---

## 2. 设计目标

本 MVP 只回答一个产品问题：

> **共享的 Team Brief + AI 建议、用户确认的 handoff，是否能让多角色 task 的推进更清晰、更安全。**

本次目标包括：

1. 在 task 房间展示当前团队介绍
2. 让当前角色能基于真实 roster 判断 handoff 对象
3. 当 AI 认为适合 handoff 时，给前端一个结构化建议
4. 由用户决定是否 handoff，以及最终交给谁
5. 尽量复用现有 task/session/forward 机制，不重做运行时架构

---

## 3. 范围

### 3.1 本次纳入范围

本 MVP 包含以下能力：

- 为 task 计算并返回 Team Brief
- 在 task 房间展示 Team Brief 面板
- 允许模型在最终回复末尾附加结构化 handoff suggestion
- 后端解析该 suggestion，并作为运行时事件 payload 返回前端
- 前端展示 handoff 确认入口
- 用户确认后，复用现有 forward + 切换目标 role/session 的流程完成交接

### 3.2 本次明确不做

以下内容明确不在本次范围：

- Team Template 二期能力
- 模板管理页
- 保存 task 为模板
- 用户模板 CRUD
- 自动 handoff，不经用户确认直接切角色
- handoff 历史时间线
- handoff suggestion 数据库存储
- 聊天消息 schema 重构
- 团队成员编辑、排序、拖拽
- task 房间中的复杂 workflow orchestration

---

## 4. 核心设计定位

### 4.1 Team Brief 是 task 运行时上下文，不是模板系统

Team Brief 的职责是：

- 向用户和当前激活角色说明当前 task 团队构成
- 解释每个 seat 的主要职责
- 告诉系统和用户“哪些角色是合理的下游 handoff 目标”

它不是：

- 模板定义系统
- 团队编辑器
- 长期资产管理模块

### 4.2 Handoff Suggestion 是运行时建议，不是自动控制权转移

模型可以建议交接，但不能直接切换角色。

固定规则如下：

- AI 只负责提出建议
- 用户负责确认是否交接
- 用户可以修改默认目标角色
- 最终 handoff 只能在真实 roster 中选择其他成员

---

## 5. 用户流程

### 5.1 Task 房间中的团队介绍

用户进入某个 task 后，系统在 task 房间展示一个紧凑的 Team Brief 面板。

该面板回答三个问题：

1. 这个 task 团队里有谁
2. 每个角色主要负责什么
3. 每个角色通常可以交给谁继续推进

### 5.2 当前角色正常对话

当前激活角色继续按现有 chat 流程与用户对话。

模型在推理时已经具备：

- 当前角色身份
- 当前 task 团队 roster
- 推荐下游角色
- 不允许推荐自己或团队外泛化职位的约束

### 5.3 模型提出交接建议

当模型判断当前工作适合交给下一个角色时：

- 在最终回复中附加一个结构化 handoff block
- 对用户可见的聊天正文仍保持自然语言结果
- 不自动切角色

### 5.4 用户确认 handoff

前端收到结构化 handoff suggestion 后：

- 展示一个 handoff 确认入口或卡片
- 默认选中 AI 推荐的目标角色
- 允许用户改选其他真实队友
- 用户确认后，复用现有 forward_latest_reply / send_message 流程把交接内容送达目标角色
- 完成后切换到对应目标 role/session

---

## 6. 数据来源与约束

### 6.1 Team Brief 的数据来源

MVP 中不新增 Team Brief 数据表。

Team Brief 由现有数据动态计算得到，主要来源：

- task
- task roles
- role archetype
- archetype 的 recommended_next_archetypes

### 6.2 允许缺失 archetype，但不能让整个 brief 失败

若某个 role 无法解析 archetype，系统仍返回该 role，但降级处理：

- archetype label 可为空
- responsibility summary 可为空
- handoff guidance 可为空
- recommended next roles 可为空

不能因为一个 role 的 archetype 丢失而导致整个 Team Brief 请求失败。

### 6.3 handoff target 必须受 roster 约束

任何 handoff suggestion 都必须满足：

- 目标必须存在于当前 task roster 中
- 目标不能是当前激活角色自己
- 目标不能只是一个泛化职位名，除非它能明确映射到 roster 中某个真实其他角色

若 suggestion 无法映射到合法目标，则前端不应采用该默认值。

---

## 7. MVP 数据结构

### 7.1 TeamBrief

```ts
interface TeamBrief {
  taskId: string;
  taskName: string;
  roles: TeamBriefRole[];
}
```

### 7.2 TeamBriefRole

```ts
interface TeamBriefRole {
  roleId: string;
  roleName: string;
  identity: string;
  archetypeId?: string;
  archetypeLabel?: string;
  responsibilitySummary?: string;
  handoffGuidance?: string;
  recommendedNextRoleIds: string[];
}
```

### 7.3 HandoffSuggestion

```ts
interface HandoffSuggestion {
  recommended: boolean;
  targetRoleId?: string;
  targetRoleName?: string;
  reason: string;
  draftMessage: string;
}
```

### 7.4 ai-request-end 扩展

```ts
interface AiRequestEndEvent {
  request_id: string;
  result: 'success' | 'error' | 'cancelled';
  error_message?: string;
  final_text?: string;
  handoffSuggestion?: HandoffSuggestion;
  timestamp: number;
}
```

---

## 8. 后端设计

### 8.1 Team Brief API

新增一个只读接口，用于根据 task 现有结构生成 Team Brief。

固定要求：

- 不新增数据库表
- 不持久化 Team Brief
- 每次请求按当前 task roles + archetype 动态计算
- 返回当前真实 roster 中的角色信息

### 8.2 handoff suggestion 解析

后端在 AI 最终响应完成后执行以下逻辑：

1. 收集最终 assistant text
2. 尝试解析末尾结构化 handoff block
3. 若解析成功：
   - 校验 target 是否为合法 roster 成员
   - 从用户可见 final_text 中移除机器可读 block
   - 将结构化结果附加到 `ai-request-end` 事件 payload
4. 若解析失败或目标非法：
   - 不返回结构化 suggestion
   - 仍保留普通 final_text

### 8.3 与现有运行时链路的关系

本次不改变现有：

- task 创建流程
- role session 创建逻辑
- prompt snapshot 存储逻辑
- 普通消息存储逻辑

本次只是在现有链路末端增加：

- Team Brief 查询能力
- handoff suggestion 解析与事件透传能力

---

## 9. 前端设计

### 9.1 Team Brief 展示位置

Team Brief 应展示在 task room 内部，而不是作为 chat 消息插入历史记录。

建议位置：

- task 头部区域附近
- 当前 PM-first 提示区域下方
- 或角色 seat grid 附近

### 9.2 展示内容

每个角色至少展示：

- role name
- identity
- archetype label（若有）
- 一句职责摘要
- 推荐下游角色摘要

### 9.3 Handoff 确认交互

当前端收到 `handoffSuggestion` 时：

- 若 suggestion 合法，则出现 handoff 确认入口
- 默认选中推荐目标
- 允许用户改选其他角色
- 允许用户确认或取消

若 suggestion 不存在或不合法：

- 不强制弹出 handoff UI
- chat 正常继续

### 9.4 复用已有交接机制

本次不新造一套 handoff 执行机制。

确认交接后，前端应尽量复用现有：

- 转发最新回复
- 切换目标角色 session
- 向目标 session 发送交接内容

---

## 10. 验收标准

### 10.1 Team Brief 功能验收

1. 用户进入 task 房间后可以看到 Team Brief
2. Team Brief 至少展示所有当前 task roles
3. archetype 存在时，能展示角色摘要与 handoff guidance 摘要
4. archetype 缺失时，仍能展示该 role，且不影响其他 role 显示
5. 推荐下游角色只包含真实 roster 中可映射的其他角色

### 10.2 Handoff Suggestion 验收

1. 模型输出合法 handoff block 时，前端能收到结构化 suggestion
2. 用户看到的聊天正文不包含机器可读 block
3. 若 suggestion 目标是自己，系统丢弃该 suggestion
4. 若 suggestion 目标不在 roster 中，系统丢弃该 suggestion
5. 若 suggestion 合法，前端默认选中推荐目标

### 10.3 用户确认交接验收

1. 用户可以看到交接确认入口
2. 用户可以修改默认目标角色
3. 用户确认后，交接内容被发送到目标角色 session
4. 完成交接后，界面切换到目标角色
5. 用户取消后，不发生角色切换，也不发送消息

---

## 11. 风险与边界

### 11.1 风险：模型建议目标不稳定

即使 prompt 已有 roster 约束，模型仍可能输出模糊目标。

处理原则：

- 只接受可明确映射到 roster 的 suggestion
- 不合法则直接丢弃默认推荐
- 前端最多提供手动选择，不做猜测性自动修正

### 11.2 风险：UI 范围膨胀

最容易失控的方向包括：

- 顺手做 handoff timeline
- 顺手做 workflow board
- 顺手做 team editor
- 顺手做长期协作状态管理

本次固定边界：

- 只做 Team Brief
- 只做 handoff 建议与确认
- 不做完整协作编排系统

### 11.3 风险：与 Team Template 概念混淆

Team Brief 面向运行中的 task；Template 面向创建前复用。

两者必须严格区分：

- Team Brief：运行时、只读、当前 task 上下文
- Template：创建前、可复用、结构来源

本次不把两者合并实现。

---

## 12. 实施顺序

### Phase A：后端只读能力

- 增加 TeamBrief / TeamBriefRole 类型
- 增加 Team Brief 查询接口
- 补充类型导出与 Tauri command 注册

### Phase B：前端 Team Brief 面板

- 增加前端 Team Brief 类型与 invoke 封装
- task 房间加载 Team Brief
- 在 TaskModeLayout 中展示 Team Brief

### Phase C：handoff suggestion 事件化

- 定义结构化 handoff block
- 后端解析 block
- 扩展 `ai-request-end` 事件 payload
- 前端接收并缓存 suggestion

### Phase D：用户确认交接

- 复用现有 forward modal 或其轻量改造版
- 默认选中推荐目标
- 确认后完成 forward + session switch

---

## 13. 最终结论

MicroCompany 当前阶段不应直接扩展到 Team Template 全量二期，而应先补足 task 运行时协作体验。

本次正式建议是：

1. **先为 task 房间增加 Team Brief，让团队结构对用户和角色都可见**
2. **让 AI 提供结构化 handoff suggestion，但不自动执行 handoff**
3. **由用户确认最终交接对象，并复用现有 forward / session 切换机制完成交接**
4. **整个能力保持 MVP 规模，不新增持久化子系统，不重构消息系统，不打开模板系统范围**

这将作为 Team Template 二期之前的一个独立、小范围、可验证的产品补丁层，用来验证多角色协作的 task-room 体验是否真正可用。
