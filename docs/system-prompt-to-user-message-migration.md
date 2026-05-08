# 系统提示词迁移方案：从 System Prompt 改为用户消息拼接

## 背景

当前 Task AI sessions 使用 Anthropic API 的 `system` 参数传递角色提示词，但存在以下问题：

1. **约束力弱**：系统提示的约束力不如用户消息强
2. **Provider 差异**：不同的 AI provider 对系统提示的处理方式不同
3. **优先级低**：当系统提示和用户消息冲突时，AI 往往优先响应用户消息
4. **实际问题**：Bob 和 Alice 反复返回空响应，说明系统提示中的"必须生成文本响应"规则被忽略

## 目标

将角色提示词从 `system` 参数改为拼接到用户第一条消息前面，提高约束力和跨 Provider 一致性。

## 核心价值

1. **约束力强**：用户消息是 AI 的主要关注点，约束力最强
2. **跨 Provider 一致性**：所有 provider 都会认真处理用户消息
3. **更明确**：放在第一条消息前面，AI 会认为这是"用户的明确要求"
4. **可验证**：可以在日志中看到完整的第一条消息内容

## 实施计划

### Phase 1: 清理系统提示词逻辑

**目标**：移除 `ClaurstSession` 中使用 `system` 参数的逻辑

**涉及文件**：
- `src-tauri/src/claurst/mod.rs`

**具体改动**：

1. **保留 `system_prompt` 字段但改变用途**
   ```rust
   pub struct ClaurstSession {
       session_id: String,
       working_dir: PathBuf,
       // ...
       system_prompt: Option<String>,  // 保留，但不再传递给 API 的 system 参数
       // 改为存储角色提示词，用于拼接到第一条用户消息
   }
   ```

2. **移除 `query_config.system_prompt` 的设置**
   ```rust
   // 在 ClaurstSession::new() 中
   // 删除或注释掉：
   // query_config.system_prompt = system_prompt.clone();
   ```

3. **保留 `system_prompt` 的存储和日志**
   - 保留 `self.system_prompt` 字段的赋值
   - 保留相关日志，方便调试

**验证**：
- 编译通过
- 日志中仍能看到 `system_prompt` 的内容
- API 请求中不再包含 `system` 参数

---

### Phase 2: 实现用户消息拼接逻辑

**目标**：在第一条用户消息前拼接角色提示词

**涉及文件**：
- `src-tauri/src/claurst/mod.rs`

**具体改动**：

1. **在 `send_message()` 中检测是否为第一条消息**
   ```rust
   pub async fn send_message(
       &mut self,
       message: &str,
       request_id: &str,
       window: Window,
       cancel_token: CancellationToken,
   ) -> Result<String, String> {
       // 检测是否为第一条用户消息
       let is_first_user_message = self.messages.is_empty() 
           || !self.messages.iter().any(|m| m.role == Role::User);
       
       // 如果是第一条消息且有角色提示词，拼接
       let actual_message = if is_first_user_message {
           if let Some(role_prompt) = &self.system_prompt {
               format!("{}\n\n---\n\n{}", role_prompt, message)
           } else {
               message.to_string()
           }
       } else {
           message.to_string()
       };
       
       // 使用 actual_message 而不是原始 message
       // ...
   }
   ```

2. **添加日志记录拼接行为**
   ```rust
   if is_first_user_message && self.system_prompt.is_some() {
       log::info!(
           "🔗 [MESSAGE_PREPEND] Prepending role prompt to first user message, role_prompt_chars={} user_message_chars={} combined_chars={}",
           self.system_prompt.as_ref().unwrap().chars().count(),
           message.chars().count(),
           actual_message.chars().count()
       );
   }
   ```

3. **处理消息存储**
   - 存储到 `self.messages` 时使用 `actual_message`
   - 存储到数据库时也使用 `actual_message`
   - 确保消息历史的一致性

**验证**：
- 第一条用户消息包含角色提示词
- 后续消息不包含角色提示词
- 日志中能看到拼接行为
- 消息历史正确存储

---

### Phase 3: 更新数据库存储逻辑

**目标**：确保拼接后的消息正确存储到数据库

**涉及文件**：
- `src-tauri/src/claurst/mod.rs`
- `src-tauri/src/storage/mod.rs`

**具体改动**：

1. **检查消息存储位置**
   - 文件存储：`ConversationStorage::save_message()`
   - 数据库存储：`messages` 表

2. **确保存储的是拼接后的消息**
   ```rust
   // 在 send_message() 中
   save_message_to_file_storage(
       &self.storage,
       &self.session_id,
       StoredMessage {
           role: "user".to_string(),
           content: actual_message.clone(),  // 使用拼接后的消息
           timestamp: chrono::Utc::now().timestamp(),
       },
       task_session,
       "user",
   );
   ```

3. **数据库存储验证**
   - 检查 `messages` 表中第一条用户消息是否包含角色提示词
   - 确保后续消息不包含角色提示词

**验证**：
- 数据库中第一条用户消息包含角色提示词
- 文件存储中第一条用户消息包含角色提示词
- 消息历史加载正确

---

### Phase 4: 处理 Session 重建和恢复

**目标**：确保 session 重建时不会重复拼接角色提示词

**涉及文件**：
- `src-tauri/src/claurst/mod.rs`

**具体改动**：

1. **在 `recreate()` 方法中处理消息历史**
   ```rust
   pub async fn recreate(&self) -> Result<ClaurstSession, String> {
       // 创建新 session
       let mut new_session = ClaurstSession::new(
           self.session_id.clone(),
           self.working_dir.clone(),
           self.api_key.clone(),
           self.model.clone(),
           self.base_url.clone(),
           self.system_prompt.clone(),  // 传递角色提示词
       )?;
       
       // 恢复消息历史
       new_session.messages = self.messages.clone();
       
       // 注意：消息历史中第一条用户消息已经包含了角色提示词
       // 不需要再次拼接
       
       Ok(new_session)
   }
   ```

2. **添加标记防止重复拼接**
   ```rust
   pub struct ClaurstSession {
       // ...
       role_prompt_prepended: bool,  // 标记是否已拼接角色提示词
   }
   
   // 在 send_message() 中
   let is_first_user_message = !self.role_prompt_prepended 
       && (self.messages.is_empty() 
           || !self.messages.iter().any(|m| m.role == Role::User));
   
   if is_first_user_message && self.system_prompt.is_some() {
       // 拼接逻辑
       self.role_prompt_prepended = true;
   }
   ```

**验证**：
- Session 重建后不会重复拼接角色提示词
- 消息历史正确恢复
- 日志中能看到重建行为

---

### Phase 5: 更新角色提示词生成逻辑

**目标**：优化角色提示词内容，使其更适合作为用户消息前缀

**涉及文件**：
- `src-tauri/src/archetypes/prompt_builder.rs`

**具体改动**：

1. **调整提示词格式**
   ```rust
   pub fn build_role_system_prompt_v2(...) -> String {
       let mut prompt = String::new();
       
       // 添加明确的分隔符和说明
       prompt.push_str("# 📋 角色配置和工作指南\n\n");
       prompt.push_str("> 以下是你的角色定义和团队协作规则，请严格遵守。\n\n");
       
       // 角色标题
       prompt.push_str(&format!("## 你的角色：{}\n\n", role_name));
       
       // ... 其他内容
       
       // 结束标记
       prompt.push_str("\n---\n\n");
       prompt.push_str("# 💬 用户消息\n\n");
       
       prompt
   }
   ```

2. **强化关键规则**
   - 保留之前加强的"必须生成文本响应"规则
   - 添加更明确的示例
   - 使用更强的措辞（"必须"、"禁止"、"违反将导致..."）

**验证**：
- 角色提示词格式清晰
- 与用户消息有明确分隔
- AI 能正确理解角色定义

---

### Phase 6: 测试和验证

**目标**：全面测试新的消息拼接机制

**测试用例**：

1. **基本功能测试**
   - 创建新 task，发送第一条消息
   - 验证第一条消息包含角色提示词
   - 验证后续消息不包含角色提示词

2. **空响应问题测试**
   - 让 AI 执行工具后观察是否返回文本
   - 验证不再出现空响应问题

3. **Session 重建测试**
   - 触发 session 重建（如取消请求）
   - 验证不会重复拼接角色提示词

4. **消息历史测试**
   - 检查数据库中的消息历史
   - 检查文件存储中的消息历史
   - 验证消息内容正确

5. **跨 Provider 测试**
   - 测试不同的 AI provider（如果有）
   - 验证行为一致性

6. **Handoff 测试**
   - 测试角色间的交接
   - 验证 handoff 标签正确解析
   - 验证转交消息正确传递

**验证标准**：
- ✅ 第一条用户消息包含角色提示词
- ✅ 后续消息不包含角色提示词
- ✅ AI 不再返回空响应
- ✅ Session 重建正常工作
- ✅ 消息历史正确存储和加载
- ✅ Handoff 功能正常工作

---

## 风险和缓解措施

### 风险 1：消息历史过长

**问题**：角色提示词拼接到第一条消息后，消息历史会变长，可能影响 token 消耗。

**缓解措施**：
- 角色提示词只拼接一次（第一条消息）
- 后续消息不包含角色提示词
- 监控 token 消耗变化

### 风险 2：消息格式混乱

**问题**：角色提示词和用户消息拼接后，格式可能不清晰。

**缓解措施**：
- 使用明确的分隔符（`---`）
- 添加清晰的标题和说明
- 在日志中记录拼接行为

### 风险 3：Session 重建时重复拼接

**问题**：Session 重建时可能重复拼接角色提示词。

**缓解措施**：
- 添加 `role_prompt_prepended` 标记
- 在 `recreate()` 中正确处理消息历史
- 添加日志验证

### 风险 4：现有 Task Sessions 兼容性

**问题**：现有的 task sessions 使用旧的 system prompt 方式，可能不兼容。

**缓解措施**：
- 现有 sessions 继续使用旧方式（消息历史已存储）
- 新创建的 sessions 使用新方式
- 提供迁移脚本（可选）

---

## 回滚方案

如果新方案出现问题，可以快速回滚：

1. **恢复 `query_config.system_prompt` 设置**
   ```rust
   query_config.system_prompt = system_prompt.clone();
   ```

2. **移除消息拼接逻辑**
   ```rust
   // 直接使用原始 message，不拼接
   let actual_message = message.to_string();
   ```

3. **重新编译和部署**

---

## 时间估算

- Phase 1: 清理系统提示词逻辑 - 1 小时
- Phase 2: 实现用户消息拼接逻辑 - 2 小时
- Phase 3: 更新数据库存储逻辑 - 1 小时
- Phase 4: 处理 Session 重建和恢复 - 1.5 小时
- Phase 5: 更新角色提示词生成逻辑 - 1 小时
- Phase 6: 测试和验证 - 2 小时

**总计**：约 8.5 小时（1 个工作日）

---

## 成功标准

1. ✅ 第一条用户消息包含角色提示词
2. ✅ 后续消息不包含角色提示词
3. ✅ AI 不再返回空响应（Bob 和 Alice 问题解决）
4. ✅ Session 重建正常工作
5. ✅ 消息历史正确存储和加载
6. ✅ Handoff 功能正常工作
7. ✅ 日志中能清晰看到拼接行为
8. ✅ 跨 Provider 行为一致

---

## 后续优化

完成基本迁移后可以考虑的优化：

1. **动态调整角色提示词**：根据对话进度动态调整提示词内容
2. **提示词压缩**：对于长对话，考虑压缩或移除角色提示词
3. **A/B 测试**：对比 system prompt 和用户消息拼接的效果
4. **监控和分析**：收集数据分析新方案的效果
