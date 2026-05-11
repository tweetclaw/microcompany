# Task AI 多角色团队协作 — 需求文档

> 版本: 1.0  
> 最后更新: 2025-05-08  
> 关联开发文档: `docs/v2/task-team-development-plan.md`

---

## 1. 概述

### 1.1 目标

使用不同的大语言模型（LLM）组成一个 **AI 团队**，每个模型扮演不同的角色（如产品经理、前端开发、后端开发、QA 工程师等），协作完成软件开发任务。

### 1.2 核心概念

| 概念 | 说明 |
|------|------|
| **Task（任务）** | 一次多角色协作工作单元，包含团队配置和目标 |
| **Role（角色）** | 团队中的一员，绑定 archetype + 专属 AI session |
| **Archetype（原型）** | 从 `agency-agents` 子工程提炼的角色定义模板 |
| **Task Session** | 角色的专属 AI 对话 session，与普通对话不同 |
| **Handoff（交接）** | 角色完成任务后，将工作交接给团队中另一个角色的机制 |

---

## 2. 功能需求

### 2.1 角色原型管理

- **来源**: 从 `/Users/wesley/aiwithblockchain/microcompany2/agency-agents` 子工程提取
- **存储**: 提取后的内容放到 `src-tauri/resources/` 资源目录
  - `resources/archetypes/` — 角色系统文件（JSON 格式，含 manifest.json）
  - `resources/role-definitions/` — 角色的 Markdown 定义文件
- **同步**: 支持从 `agency-agents` 目录重新提取和更新资源文件

### 2.2 任务 AI Session 管理

每个角色拥有自己**专属的 task session**，与普通 AI 对话有以下区别：

- Task Session 绑定到具体的任务（task_id）和角色（role_id）
- Task Session 有独立的对话历史和上下文
- 数据库中通过 `type` 列区分（`'normal'` vs `'task'`）
- 支持 **restart**: 角色上下文过长或出现异常时，丢弃旧 session，创建新 session
- 后续规划: task AI session 历史信息管理（允许删除）

### 2.3 系统提示词机制

#### 2.3.1 基本策略

**不从 Claurst 的 system 参数传递角色提示词**。原因是 system prompt 对 AI 行为的约束力太弱。

替代方案: 在新建的 task AI session 的**第一个用户消息前面拼接**系统提示词。这种方式在对话上下文中的约束效果更好。

#### 2.3.2 提示词内容

系统提示词告诉每个 role 的 AI session：

1. **团队配置**: 所有成员及其编号（a, b, c...）/ 角色名称 / 身份
2. **自己的角色定位**: 当前角色在团队中的位置
3. **角色定义**: 指导 AI 读取 role-definition Markdown 文件
4. **交接规则**:
   - 何时需要交接（工作完成、需要其他角色介入）
   - 交接格式: `<handoff>成员编号</handoff>`
   - 不需要交接时也须输出: `<handoff></handoff>`
5. **输出格式要求**: 每次回答必须包含文本 + 交接标签

#### 2.3.3 防重复机制

使用 `role_prompt_prepended` 标记，确保系统提示词仅在新 session 的第一条消息前拼接，后续消息不重复。

### 2.4 工作交接（Handoff）机制

#### 2.4.1 交接触发

角色 AI 在完成当前阶段工作后，通过产生交接内容来触发工作交接。

#### 2.4.2 方式一：标签解析（当前使用）✅

AI 在回复末尾输出 `<handoff>成员编号</handoff>` 标签。

**流程:**
1. AI 输出包含 `<handoff>` 标签的完整回复
2. 后端 `handoff_observer` 解析标签，提取目标成员编号
3. 前端弹出 **ForwardLatestReplyModal** 调度确认界面
4. 用户确认目标角色（可修改）并可输入额外要求
5. 确认后，消息被转发到目标角色的 AI session

**标签规范:**
```
需要交接:   <handoff>b</handoff>
不需要交接: <handoff></handoff>
```

**优先级规则:** 多个标签时取第一个。

#### 2.4.3 方式二：智能自动调度（Phase 2，暂未开启）

每个角色 AI 的每一条消息都被一个**监督 AI** 读取，监督 AI 生成调度 JSON 代码。后端代码解析 JSON 后自动找到接手人并调度。

**暂停原因:** 每条消息都要额外调用一次 AI 进行调度分析，token 消耗过大。

**现状:** 完整代码已开发（`handoff_observer.rs` + `commands/handoff.rs`），但以块注释方式关闭。

#### 2.4.4 调度确认界面

- 显示当前角色 → 目标角色的交接建议
- 用户可以: 确认 / 修改目标角色 / 输入额外需求
- 确认后消息自动转发到目标角色的 session

---

## 3. 数据库设计需求

### 3.1 Task 相关表

| 表名 | 用途 |
|------|------|
| `sessions` | 统一存储普通 session 和 task session（通过 `type` 列区分） |
| `messages` | 统一存储所有消息 |
| `tasks` | 任务元数据 |
| `roles` | 角色配置（绑定 archetype、system prompt snapshot） |
| `task_templates` | 任务模板（可复用） |

### 3.2 关键字段

- `sessions.type`: `'normal'` / `'task'`
- `sessions.task_id`: 关联的任务 ID（task session 专用）
- `roles.handoff_enabled`: 是否启用交接功能
- `roles.system_prompt_snapshot`: 角色创建时的系统提示词快照
- `roles.prompt_contract_version`: 提示词版本号

---

## 4. 非功能性需求

- **向后兼容**: 旧版普通 session 数据不受影响
- **提示词版本管理**: 记录每次角色创建时的 prompt hash 和 contract version
- **日志追踪**: 交接流程全过程日志记录（handoff 解析、转发、session 切换）
