# 系统提示词架构说明

## 概述

本文档说明 Task 团队协作系统中，不同类型的 Session 如何处理系统提示词和团队信息。

---

## 关键概念

### 1. Claurst 系统提示词 vs Task 角色提示词

系统中存在**两种不同的提示词**：

#### A. **Claurst 系统提示词**（固定的）
- 定义在 `claurst-core` 库中
- 包含 Claurst 的基础能力说明（文件操作、命令执行、工具使用等）
- 包含动态环境信息（工作目录、平台、Shell 等）
- **所有 Session 都使用相同的 Claurst 系统提示词**
- 通过 Claude API 的 `system` 参数传递

示例：
```
You are Claurst, Anthropic's official CLI for Claude.

## Capabilities
- Read/Write files
- Execute commands
- Search
...

__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__

<env>
Working directory: /Users/wesley/project
Platform: darwin
...
</env>
```

#### B. **Task 角色提示词**（动态生成的）
- 为每个 Task 角色动态生成
- 包含角色定义、团队成员列表、Handoff 规则等
- 存储在数据库的 `roles.system_prompt_snapshot` 字段
- **通过第一条用户消息传递给 AI**（不是系统提示词）

示例：
```
你是 Alice，担任 Product Manager 角色。

## 团队配置

当前团队成员：
a. Alice - Product Manager (你)
b. Bob - Backend Developer
c. Charlie - Frontend Developer

## Handoff 规则
...
```

---

## 数据流程

### 创建 Task 时

1. **生成角色提示词**
   ```rust
   // src-tauri/src/api/task_impl.rs
   let contexts = build_role_prompt_contexts(&roles);
   for (role, context) in roles.iter().zip(contexts.iter()) {
       let prompt = build_role_system_prompt_v2(
           &role.name,
           &role.identity,
           role_definition_path,
           Some(context),  // 包含 roster（团队花名册）
           working_directory
       );
       // 保存到数据库
       role.system_prompt_snapshot = prompt;
   }
   ```

2. **创建 Claurst Session**
   ```rust
   // src-tauri/src/api/task_impl.rs
   let session = ClaurstSession::new(
       session_id,
       working_dir,
       api_key,
       model,
       base_url,
       Some(prompt_snapshot.text.clone()),  // 传入角色提示词
   )
   ```

3. **配置 QueryConfig**
   ```rust
   // src-tauri/src/claurst/mod.rs
   query_config.system_prompt = if is_task_session {
       None  // Task session 不使用 query_config.system_prompt
   } else {
       system_prompt.clone()  // 非 Task session 使用
   };
   ```

### 发送第一条消息时

```rust
// src-tauri/src/claurst/mod.rs
pub async fn send_message(&mut self, message: &str, ...) {
    let is_first_user_message = !self.role_prompt_prepended;
    
    let actual_message = if is_first_user_message && self.system_prompt.is_some() {
        // 第一条消息时，将角色提示词拼接到用户消息前面
        let role_prompt = self.system_prompt.as_ref().unwrap();
        format!("{}\n\n---\n\n{}", role_prompt, message)
    } else {
        // 后续消息直接使用用户输入
        message.to_string()
    };
    
    self.role_prompt_prepended = true;
    self.messages.push(Message::user(actual_message));
    
    // 调用 Claude API
    run_query_loop(&self.client, &mut self.messages, ...);
}
```

---

## 最终发送给 Claude API 的内容

### Task Session（第一条消息）

**System Prompt**（通过 API 的 `system` 参数）：
```
You are Claurst, Anthropic's official CLI for Claude.
...（Claurst 固定提示词）
```

**Messages**（通过 API 的 `messages` 参数）：
```json
[
  {
    "role": "user",
    "content": "你是 Alice，担任 Product Manager 角色。\n\n## 团队配置\n...\n\n---\n\n用户的实际输入"
  }
]
```

### Task Session（后续消息）

**System Prompt**：
```
You are Claurst, Anthropic's official CLI for Claude.
...（Claurst 固定提示词）
```

**Messages**：
```json
[
  {
    "role": "user",
    "content": "你是 Alice，担任 Product Manager 角色。\n\n## 团队配置\n...\n\n---\n\n第一条用户输入"
  },
  {
    "role": "assistant",
    "content": "AI 的回复..."
  },
  {
    "role": "user",
    "content": "第二条用户输入"  // 直接使用用户输入，不再拼接
  }
]
```

### 非 Task Session

**System Prompt**：
```
You are Claurst, Anthropic's official CLI for Claude.
...（Claurst 固定提示词）
```

**Messages**：
```json
[
  {
    "role": "user",
    "content": "用户输入"
  }
]
```

---

## 关键字段说明

### `ClaurstSession.role_prompt_for_first_message`
- 类型：`Option<String>`
- 用途：保存 Task 角色提示词（包含团队信息）
- 使用方式：**在第一条用户消息时拼接到用户输入前面**
- 注意：这个字段**不是**传递给 Claude API 的 `system` 参数，而是拼接到第一条用户消息中

### `QueryConfig.system_prompt`
- 类型：`Option<String>`
- 用途：传递给 Claude API 的 `system` 参数
- 对于 Task Session：设置为 `None`（使用 Claurst 固定提示词）
- 对于非 Task Session：可以自定义

### `ClaurstSession.role_prompt_prepended`
- 类型：`bool`
- 用途：标记是否已经将角色提示词拼接到第一条用户消息
- 初始值：`false`（新 Session）或 `true`（从数据库恢复的 Session）
- 作用：确保角色提示词只在第一条消息时拼接一次

---

## 为什么这样设计？

### 为什么不使用 Claude API 的 `system` 参数传递团队信息？

1. **Claurst 固定提示词已经占用了 `system` 参数**
   - Claurst 的基础能力说明必须通过 `system` 参数传递
   - Claude API 只支持一个 `system` 参数

2. **团队信息需要动态变化**
   - 每个角色的团队信息不同（"你" 的位置不同）
   - 如果放在 `system` 参数，需要为每个角色创建不同的 Claurst 实例

3. **通过用户消息传递更灵活**
   - 可以在对话历史中保留团队信息
   - 未来可以支持动态更新团队信息（通过发送新的用户消息）

### 为什么只在第一条消息时拼接？

1. **避免重复**
   - 团队信息在第一条消息中已经传递给 AI
   - AI 会在整个对话中记住这些信息

2. **节省 Token**
   - 后续消息不需要重复发送团队信息
   - 减少 API 调用成本

3. **保持对话自然**
   - 用户的后续输入不会被团队信息"污染"

---

## 常见误解

### ❌ 误解 1：团队信息通过 Claude API 的 `system` 参数传递
**正确理解**：团队信息通过第一条用户消息传递，`system` 参数只包含 Claurst 固定提示词。

### ❌ 误解 2：`ClaurstSession.system_prompt` 字段是传递给 API 的系统提示词
**正确理解**：这个字段保存的是 Task 角色提示词，会拼接到第一条用户消息中，不是传递给 API 的 `system` 参数。

### ❌ 误解 3：每条消息都会拼接团队信息
**正确理解**：只有第一条消息会拼接，后续消息直接使用用户输入。

---

## 成员增删的影响

### 当前问题

当调用 `add_task_role` 或 `delete_task_role` 时：
- ✅ 新角色的提示词包含最新的团队信息
- ❌ 其他角色的 `system_prompt_snapshot` 不会更新
- ❌ 其他角色的 AI Session 仍然使用旧的团队信息

### 原因

团队信息在创建角色时就固化在 `system_prompt_snapshot` 中，并且在第一条消息时就已经发送给 AI。

### 解决方案

#### 方案 1：重新生成所有角色的提示词（高成本）
```rust
pub async fn add_task_role(...) -> Result<Task, String> {
    // 1. 插入新角色
    // ...
    
    // 2. 重新生成所有角色的提示词
    let task = get_task(task_id.clone()).await?;
    let contexts = build_role_prompt_contexts(&task.roles);
    
    for (role, context) in task.roles.iter().zip(contexts.iter()) {
        let new_prompt = build_role_system_prompt_v2(..., Some(context), ...);
        update_role_system_prompt(role.id, new_prompt)?;
        // 需要重新创建 Session（会丢失对话历史）
    }
}
```

**缺点**：需要重新创建所有 Session，会丢失对话历史。

#### 方案 2：通过消息通知（推荐）
在每次用户消息前，检测团队是否变化，如果变化则注入更新通知：

```rust
pub async fn send_message(&mut self, message: &str, ...) -> Result<String> {
    let actual_message = if is_first_user_message && self.system_prompt.is_some() {
        // 第一条消息：拼接完整的角色提示词
        format!("{}\n\n---\n\n{}", self.system_prompt.as_ref().unwrap(), message)
    } else if team_roster_changed {
        // 后续消息：如果团队变化，注入更新通知
        let latest_roster = get_latest_team_roster(task_id)?;
        format!("<system-reminder>团队配置已更新：\n{}</system-reminder>\n\n{}", 
            latest_roster, message)
    } else {
        message.to_string()
    };
    
    // ...
}
```

**优点**：
- 不需要重新创建 Session
- 保留对话历史
- 实时反映团队变化

**需要解决的问题**：
- 成员编号问题：需要使用稳定的标识符（role_id 或固定编号），而不是基于索引的字母
- Handoff 格式调整：从 `<handoff>b</handoff>` 改为 `<handoff role_id="xxx">` 或 `<handoff>role_name</handoff>`

---

## 总结

1. **Claurst 系统提示词**：固定的，通过 Claude API 的 `system` 参数传递
2. **Task 角色提示词**：动态生成的，通过第一条用户消息传递
3. **团队信息**：包含在角色提示词中，只在第一条消息时发送
4. **成员增删**：当前无法让其他成员感知，需要实现动态通知机制

---

## 相关代码文件

- `src-tauri/src/claurst/mod.rs`：Claurst Session 管理和消息处理
- `src-tauri/src/api/task_impl.rs`：Task 和角色创建逻辑
- `src-tauri/src/archetypes/prompt_builder.rs`：角色提示词生成
- `claurst-core`：Claurst 固定系统提示词定义
