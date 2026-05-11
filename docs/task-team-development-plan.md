# Task AI 多角色团队协作 — 开发计划与现状

> 版本: 1.0  
> 最后更新: 2025-05-08  
> 关联需求文档: `docs/v2/task-team-requirements.md`

---

## 目录

- [1. 概述](#1-概述)
- [2. 已完成模块](#2-已完成模块)
- [3. Phase 2 待开发](#3-phase-2-待开发)
- [4. 后续规划](#4-后续规划)
- [5. 架构设计说明](#5-架构设计说明)
- [6. 关键文件索引](#6-关键文件索引)
- [附录: 被归档的源文档](#附录-被归档的源文档)

---

## 1. 概述

本文档记录 Task AI 多角色团队协作功能的开发计划和当前实现状态。

**开发阶段划分:**

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | 基础架构 + 标签式 Handoff | ✅ 已完成 |
| Phase 2 | 智能自动调度 | ⏸️ 已开发但暂停使用 |
| 后续规划 | Task session 历史管理、UI 增强等 | 📋 待规划 |

---

## 2. 已完成模块

### 2.1 Archetype 原型管理 ✅

**实现位置:** `src-tauri/src/archetypes/`

| 文件 | 功能 | 状态 |
|------|------|------|
| `mod.rs` | 模块入口、数据结构定义 | ✅ |
| `loader.rs` | 从 `resources/archetypes/` 加载系统 JSON 文件 | ✅ |
| `sync.rs` | 从 `agency-agents/` 子工程同步/提取原型文件 | ✅ |
| `prompt_builder.rs` | 构建角色系统提示词（v2，含团队配置和交接规则） | ✅ |

**资源文件位置:**
- `src-tauri/resources/archetypes/manifest.json` — 原型清单
- `src-tauri/resources/role-definitions/` — 5 个 Markdown 定义文件

**关键实现细节:**
- `build_role_system_prompt_v2()` 生成包含团队配置、角色编号 (a/b/c)、交接规则、输出格式要求的完整提示词
- 提示词版本契约: `TASK_PROMPT_CONTRACT_VERSION = "task-role-v6-structured-handoff"`

### 2.2 系统提示词 → 用户消息首条拼接 ✅

**实现位置:** `src-tauri/src/claurst/mod.rs` (L1048-L1099)

不再通过 Claurst API 的 `system` 参数传递角色提示词。改为在 task AI session 的第一条用户消息前拼接。

**关键逻辑:**
- `role_prompt_prepended` 标记：首次消息拼接后设为 `true`，后续消息跳过
- session 重建时标记重置（新 session 的第一条消息会再次拼接）
- 日志: 全部带有 `[ROLE_PROMPT]` 或 `[MESSAGE_PREPEND]` 前缀，便于追踪

**设计原因:** 用户消息在对话上下文中的权重高于 system prompt，约束效果更好。

### 2.3 Task Session 架构 ✅

**实现位置:** `src-tauri/src/api/task_impl.rs`, `src-tauri/src/api/task_queries.rs`, `src-tauri/src/api/task.rs`

| 功能 | 实现 | 状态 |
|------|------|------|
| Task 创建 | `create_task` — 创建 roles + sessions | ✅ |
| Role 管理 | `add_task_role`, `update_task_role`, `delete_task_role`, `reorder_task_roles` | ✅ |
| Session 重启 | `restart_task_role_session` — 丢弃旧 session，创建新 session | ✅ |
| 角色切换 | 前端 `handleTaskRoleSelected` 切换当前活跃角色 | ✅ |

**数据库设计:**
- `sessions` 表通过 `type` 列统一管理 (`'normal'` / `'task'`)，共享 `messages` 表
- `roles` 表记录 `system_prompt_snapshot` 和 `prompt_contract_version`，保证可追溯

### 2.4 Handoff 标签解析 ✅

**实现位置:** `src-tauri/src/handoff_observer.rs` (L371-L419)

**当前使用方式:** 从 AI 回复中解析 `<handoff>成员编号</handoff>` 标签

```rust
fn parse_handoff_tag(text: &str) -> Option<String>
pub fn extract_handoff_from_tag(last_message: &str) -> Result<HandoffInfo>
```

**解析规则:**
- 查找第一个 `<handoff>`…`</handoff>` 标签
- 空标签 (`<handoff></handoff>`) → 无需交接
- 非空标签 → 提取目标成员编号
- 多个标签时取第一个

**后端命令:** `src-tauri/src/commands/handoff.rs`

```rust
#[tauri::command]
pub async fn extract_handoff_suggestion(
    role_name: String,
    last_message: String,
    _available_roles: Vec<String>,
) -> Result<HandoffInfo, String>
```

### 2.5 调度确认 UI ✅

**实现位置:** `src/components/ForwardLatestReplyModal.tsx` (`src/App.tsx` L505-L600)

**流程:**

```
AI 输出 </handoff> 标签
    ↓
ChatInterface 检测 handoff 并触发事件
    ↓
App.tsx handleHandoffSuggestion() 接收
    ↓
ForwardLatestReplyModal 弹出:
  - 显示交接建议（源角色 → 目标角色）
  - 用户可修改目标角色
  - 用户可输入额外要求
    ↓
用户确认 → handleForwardConfirm()
  - 切换到目标角色 session
  - 转发消息内容
  - 自动发送
```

**关键代码路径:**
- `App.tsx`: `pendingHandoffSuggestion` state + `handleHandoffSuggestion` / `handleForwardConfirm`
- `ForwardLatestReplyModal.tsx`: 确认对话框 UI
- `ChatInterface.tsx`: handoff 检测事件发射

### 2.6 前端 Task 工作区 ✅

**实现位置:** `src/components/TaskModeLayout.tsx`, `src/components/TaskWorkspace.tsx`

- 团队面板（角色列表、在线状态）
- 角色切换
- Session 重建按钮

---

## 3. Phase 2 待开发

### 3.1 智能自动调度（已开发但暂停使用）

**代码位置:**
- `src-tauri/src/handoff_observer.rs` L12-L366 — 全部 Block Comment
- `src-tauri/src/commands/handoff.rs` L33-L135 — 全部 Block Comment

**工作原理:**
1. 每个角色 AI 的每条消息被监督 AI 读取
2. 监督 AI 分析内容并生成调度 JSON: `{ has_handoff, task_summary, key_requirements, suggested_role_id }`
3. 后端解析 JSON 自动路由到目标角色

**暂停原因:** 每条消息额外调用一次 AI 做调度分析，token 消耗过大。

**恢复条件:**
- 寻找更经济的调度分析方案（如小型专用模型）
- 或仅在特定条件下触发（如检测到明确交接意图时）
- 或用户可选择是否开启

**恢复步骤:**
1. 解除 `handoff_observer.rs` 中 `extract_handoff_info()` 函数的块注释
2. 解除 `commands/handoff.rs` 中 `extract_handoff_suggestion_with_ai` 命令的块注释
3. 前端调用侧切换为 `extract_handoff_suggestion_with_ai`
4. 配置文件添加 `routing_config`（专用路由模型配置）

---

## 4. 后续规划

| 规划项 | 描述 | 优先级 |
|--------|------|--------|
| Task session 历史管理 | 允许用户查看/删除旧 task session 的历史记录 | 中 |
| 交接流程增强 | 支持多轮交接、交接链可视化 | 中 |
| 智能调度恢复 | 寻找经济方案恢复智能自动调度 | 低 |
| 角色模板市场 | 用户自定义/分享角色模板 | 低 |

---

## 5. 架构设计说明

### 5.1 为什么系统提示词拼接在用户消息中?

**对比:**

| 方式 | 优点 | 缺点 |
|------|------|------|
| `system` 参数传递 | API 原生支持 | 约束力弱，模型容易忽略 |
| **拼接在首个用户消息前** ✅ | 对话上下文中权重更高，约束效果好 | 占用 context window |

### 5.2 为什么统一 sessions 表?

最初计划分为 `normal_sessions` + `normal_messages` 和 task 专属表，但最终采用统一 `sessions` + `messages` 表，通过 `type` 列区分。

**优势:** 减少表数量、统一 API 查询逻辑、便于未来扩展更多 session 类型。

### 5.3 系统文件来源与同步

```
agency-agents/ 子工程（源）        src-tauri/resources/（目标）
  ├── archetype 定义                ├── archetypes/manifest.json
  └── role definition .md           └── role-definitions/*.md
```

同步方向: agency-agents → resources（单向提取）。通过 `archetypes/sync.rs` 实现。

---

## 6. 关键文件索引

### 后端 Rust

| 文件 | 功能 |
|------|------|
| `src-tauri/src/archetypes/mod.rs` | 原型数据结构 |
| `src-tauri/src/archetypes/loader.rs` | 原型文件加载 |
| `src-tauri/src/archetypes/sync.rs` | agency-agents 同步 |
| `src-tauri/src/archetypes/prompt_builder.rs` | 系统提示词构建 |
| `src-tauri/src/api/task.rs` | Task API 类型定义 |
| `src-tauri/src/api/task_impl.rs` | Task API 实现 |
| `src-tauri/src/api/task_queries.rs` | Task 数据库查询 |
| `src-tauri/src/claurst/mod.rs` | Claurst 请求处理（含提示词拼接逻辑） |
| `src-tauri/src/handoff_observer.rs` | Handoff 解析（标签 + 已注释的智能调度） |
| `src-tauri/src/commands/handoff.rs` | Handoff Tauri 命令 |

### 前端 TypeScript

| 文件 | 功能 |
|------|------|
| `src/App.tsx` | Handoff 调度流程入口 |
| `src/components/TaskModeLayout.tsx` | Task 模式主布局 |
| `src/components/TaskWorkspace.tsx` | 团队工作区面板 |
| `src/components/ForwardLatestReplyModal.tsx` | 调度确认弹窗 |
| `src/components/ChatInterface.tsx` | Handoff 事件检测与发射 |
| `src/api/index.ts` | Task API 调用 |
| `src/api/handoff.ts` | Handoff API 调用 |

### 资源文件

| 路径 | 内容 |
|------|------|
| `src-tauri/resources/archetypes/manifest.json` | 7 个系统角色原型清单 |
| `src-tauri/resources/role-definitions/*.md` | 5 个 Markdown 角色定义 |
| `agency-agents/` | 源角色定义子工程 |

---

## 附录: 被归档的源文档

以下 5 个原始文档已被本文件替代，归档到 `docs/v2/archived/`:

| 原文件 | 归档路径 |
|--------|----------|
| `docs/task/handoff-tag-parsing.md` | 已删除（内容合并至本文档） |
| `docs/task/phase3-ui-handoff-confirmation.md` | 已删除（内容合并至本文档） |
| `docs/task/system-prompt-refactoring-plan.md` | 已删除（内容合并至本文档） |
| `docs/system-prompt-to-user-message-migration.md` | 已删除（内容合并至本文档） |
| `docs/task-session-architecture.md` | 已删除（内容合并至本文档） |
