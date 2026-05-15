# 代码重构总结：system_prompt 字段重命名

## 重构日期
2025-01-XX

## 重构原因

1. **字段命名容易混淆**：`ClaurstSession.system_prompt` 这个名字让人误以为它是传递给 Claude API 的 `system` 参数
2. **实际用途不同**：这个字段实际上是 Task 角色提示词，会拼接到第一条用户消息中，而不是作为系统提示词传递
3. **历史遗留问题**：这个字段曾经被当做系统提示词使用，但效果很差，后来改成了用户消息的拼接前缀
4. **代码被误删**：在提交 `77fdb89` 中，拼接逻辑被误删，导致团队信息根本没有传递给 AI

## 重构内容

### 1. 字段重命名

**修改文件**：`src-tauri/src/claurst/mod.rs`

**变更**：
```rust
// 之前
pub struct ClaurstSession {
    system_prompt: Option<String>,  // 角色提示词，仅用于首次请求的运行时注入
    // ...
}

// 之后
pub struct ClaurstSession {
    /// Task 角色提示词，仅在第一条用户消息时作为前缀拼接
    /// 包含角色定义、团队成员列表、Handoff 规则等
    /// 注意：这不是传递给 Claude API 的 system 参数，而是拼接到第一条用户消息中
    role_prompt_for_first_message: Option<String>,
    // ...
}
```

### 2. 函数签名更新

```rust
// 之前
pub fn new(
    session_id: String,
    working_dir: PathBuf,
    api_key: String,
    model: String,
    base_url: Option<String>,
    system_prompt: Option<String>,
) -> anyhow::Result<Self>

// 之后
pub fn new(
    session_id: String,
    working_dir: PathBuf,
    api_key: String,
    model: String,
    base_url: Option<String>,
    role_prompt_for_first_message: Option<String>,
) -> anyhow::Result<Self>
```

### 3. 恢复被误删的拼接逻辑

```rust
// 在 send_message 函数中恢复
let actual_message = if is_first_user_message && self.role_prompt_for_first_message.is_some() {
    let role_prompt = self.role_prompt_for_first_message.as_ref().unwrap();
    let combined = format!("{}\n\n---\n\n{}", role_prompt, message);
    
    log::info!(
        "🔗 [MESSAGE_PREPEND] Prepending role prompt to first user message: request_id={} session_id={} role_prompt_chars={} user_message_chars={} combined_chars={}",
        request_id,
        self.session_id,
        role_prompt.chars().count(),
        message.chars().count(),
        combined.chars().count()
    );
    
    combined
} else {
    message.to_string()
};
```

### 4. 清理垃圾代码

**删除的内容**：
- 日志中的 `configured_system_prompt_chars` 参数（这个参数在 Task Session 中总是 0，没有意义）
- 混淆的日志消息："relying on claurst system prompt path"（实际上是拼接到用户消息）

**改进的日志**：
```rust
// 之前
log::info!(
    "🔗 [MESSAGE_PREPEND] First user message detected, relying on claurst system prompt path: request_id={} session_id={} has_system_prompt={}",
    request_id,
    self.session_id,
    self.system_prompt.is_some()
);

// 之后
log::info!(
    "🔗 [MESSAGE_PREPEND] First user message without role prompt: request_id={} session_id={} has_role_prompt={}",
    request_id,
    self.session_id,
    self.role_prompt_for_first_message.is_some()
);
```

### 5. 代码注释改进

**QueryConfig.system_prompt 的注释**：
```rust
// Task session 使用 Claurst 固定系统提示词（由 claurst-core 提供）
// 非 Task session 可以自定义系统提示词
query_config.system_prompt = if is_task_session {
    None  // 使用 Claurst 默认系统提示词
} else {
    role_prompt_for_first_message.clone()  // 自定义���统提示词
};
```

## 架构澄清

### Claurst 系统提示词 vs Task 角色提示词

系统中存在**两种不同的提示词**：

#### 1. Claurst 系统提示词（固定的）
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

#### 2. Task 角色提示词（动态生成的）
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

### 最终发送给 Claude API 的内容

**Task Session（第一条消息）**：

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

## 影响范围

### 修改的文件
- `src-tauri/src/claurst/mod.rs`：核心重构文件
- `docs/system_prompt_architecture.md`：架构文档更新

### 不需要修改的文件
- `src-tauri/src/api/task_impl.rs`：调用 `ClaurstSession::new` 时传递的参数名会自动匹配
- 数据库结构：`roles.system_prompt_snapshot` 字段名保持不变（这是正确的，因为它确实是提示词快照）

## 验证

### 编译检查
```bash
cd /Users/wesley/aiwithblockchain/microcompany2
cargo check --manifest-path src-tauri/Cargo.toml
```

**结果**：✅ 编译通过，只有一些无关的警告

### 功能验证
- [ ] 创建新的 Task，验证角色提示词是否正确生成
- [ ] 发送第一条消息，验证团队信息是否正确拼接
- [ ] 发送后续消息，验证不会重复拼接
- [ ] 查看日志，验证日志信息是否清晰准确

## 后续工作

### 1. 解决成员增删问题
当前问题：新增或删除成员时，其他成员无法感知团队变化。

**推荐方案**：在每次用户消息前，检测团队是否变化，如果变化则注入更新通知：

```rust
pub async fn send_message(&mut self, message: &str, ...) -> Result<String> {
    let actual_message = if is_first_user_message && self.role_prompt_for_first_message.is_some() {
        // 第一条消息：拼接完整的角色提示词
        format!("{}\n\n---\n\n{}", self.role_prompt_for_first_message.as_ref().unwrap(), message)
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

### 2. 改进 Handoff 机制 ✅（已完成 - 2025-05-14）

~~当前问题：Handoff 使用基于索引的字母编号（a, b, c...），成员增删会导致编号错位。~~

**已采用方案 B**：改为使用稳定的 `role_name` 作为 Handoff 标识符，同时升级为结构化 `[HANDOFF]` 块格式。

**修改文件**：
- `src-tauri/src/archetypes/prompt_builder.rs`：`build_team_composition_v2` 改为使用 `role_name` 列表 + `[HANDOFF]` 块格式
- `src-tauri/src/handoff_observer.rs`：`parse_handoff_tag` 改为 `parse_handoff_block`，解析 `[HANDOFF]...[/HANDOFF]` 格式
- `src/components/ChatInterface.tsx`：`resolveSuggestedTaskRole` 移除了不稳定的字母编号回退逻辑
- `TASK_PROMPT_CONTRACT_VERSION` 升级为 `task-role-v7-stable-handoff`

**新格式（AI 输出）**：
```
[HANDOFF]
recommended: yes
target_role: Developer
reason: 需要开发实现
draft_message: 请继续推进，已完成需求分析，下一步需要实现功能。
[/HANDOFF]
```

**解析链路**：
```
AI 输出 [HANDOFF] 块
  → handoff_observer::parse_handoff_block  ← 解析 recommended 和 target_role（角色名）
  → claurst::extract_handoff_block         ← 主路径，直接解析完整结构化块（包含 reason/draft_message）
  → claurst::resolve_handoff_suggestion    ← 用 role_name 在 DB roster 中 lookup role_id
  → HandoffSuggestion { target_role_id, target_role_name, ... }
  → 前端 onHandoffSuggestion 回调
```

## 总结

这次重构主要解决了以下问题：

1. ✅ **字段命名更清晰**：`role_prompt_for_first_message` 准确描述了字段的用途
2. ✅ **恢复了被误删的功能**：团队信息现在会正确传递给 AI
3. ✅ **清理了垃圾代码**：删除了混淆的日志和无意义的参数
4. ✅ **改进了代码注释**：明确区分了两种不同的提示词
5. ✅ **更新了架构文档**：详细说明了系统提示词的处理方式
6. ✅ **修复了 Handoff 格式不匹配 bug**：提示词格式与解析器现在完全一致
7. ✅ **Handoff 标识符改为稳定的 role_name**：不再依赖可变的字母顺序编号

## 待完成工作

### 成员增删感知问题

当前问题：新增或删除成员时，其他成员的 AI Session 感知不到团队变化。

**推荐方案**：在每次用户消息前，检测团队是否变化，如果变化则注入 `<system-reminder>` 通知：

```rust
pub async fn send_message(&mut self, message: &str, ...) -> Result<String> {
    let actual_message = if is_first_user_message && self.role_prompt_for_first_message.is_some() {
        // 第一条消息：拼接完整的角色提示词
        format!("{}\n\n---\n\n{}", self.role_prompt_for_first_message.as_ref().unwrap(), message)
    } else if team_roster_changed {
        // 后续消息：如果团队变化，注入更新通知
        let latest_roster = get_latest_team_roster(task_id)?;
        format!("<system-reminder>团队配置已更新：\n{}</system-reminder>\n\n{}", 
            latest_roster, message)
    } else {
        message.to_string()
    };
}
```
