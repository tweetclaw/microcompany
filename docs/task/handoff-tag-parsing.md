# 开发任务：Handoff 标签解析方案

**任务编号**: Handoff-Tag-Parsing  
**创建日期**: 2026-05-05  
**预计工期**: 1-2 天  
**前置依赖**: 延迟合并方案已完成  
**状态**: 待审阅

---

## 1. 任务背景

### 1.1 当前方案

**智能路由系统（DeepSeek）**：
- AI 输出包含 `<handoff>` 标签
- 后端调用 DeepSeek API 分析 AI 响应
- 使用 JSON 模式提取交接信息（目标角色、任务摘要、关键需求）
- 生成摘要后转发给下一个角色

**问题**：
- 增加了额外的 API 调用成本
- 响应时间较长（~7秒）
- AI 已经在 `<handoff>` 标签中明确指定了目标角色
- 摘要可能丢失原始上下文信息

### 1.2 新方案优势

**简单标签解析**：
- ✅ **更简单**：直接解析标签，无需额外 AI 调用
- ✅ **更快**：无网络延迟，即时响应
- ✅ **更准确**：AI 自己决定交接目标
- ✅ **完整上下文**：转发完整消息，不丢失信息
- ✅ **零成本**：无额外 API 费用

---

## 2. 技术方案

### 2.1 标签解析逻辑

**输入**：AI 响应文本
**输出**：目标成员编号（或 None）

**解析规则**：
```rust
// 示例 1：需要交接
<handoff>b</handoff>  → Some("b")

// 示例 2：不需要交接
<handoff></handoff>   → None

// 示例 3：无标签
(无标签)              → None
```

**实现方式**：
- 使用正则表达式：`<handoff>(.*?)</handoff>`
- 提取标签内容
- 如果内容为空或无标签，返回 None
- 如果有内容，返回成员编号

### 2.2 消息转发格式

**不再使用摘要**，改为转发完整消息：

```
请接手工作，用户的需求是：[用户的额外输入]

前一个角色的最后一条信息是：
---
[前一个 AI 的完整响应]
---
```

**说明**：
- 用户可以输入额外说明（可选）
- 如果用户没有输入，只显示"请接手工作"
- 前一个 AI 的完整响应用分隔线包裹，便于阅读

### 2.3 交互流程

```
1. AI 完成响应，输出包含 <handoff>b</handoff>
   ↓
2. 后端解析标签，提取目标成员编号 "b"
   ↓
3. 查找成员 "b" 对应的角色（bob - Backend Developer）
   ↓
4. 前端弹出交接确认界面
   - **核心展示**：目标角色 bob (Backend Developer)
   - **核心展示**：用户输入框（添加额外说明）
   - **二级菜单**：点击按钮查看前一个 AI 的完整消息
     - 默认不展示，避免界面过长
     - 点击"查看完整消息"按钮后展开
     - 二级界面支持滚动（消息可能很长）
   ↓
5. 用户确认后，拼接消息
   ↓
6. 发送给目标角色的 session
```

---

## 3. 需要修改的文件

### 3.1 后端文件

**文件 1：`src-tauri/src/handoff_observer.rs`**

**修改内容**：
1. 注释掉 DeepSeek API 调用代码（保留以便将来恢复）
2. 添加简单的标签解析函数：
   ```rust
   fn parse_handoff_tag(text: &str) -> Option<String> {
       // 使用正则表达式提取 <handoff>内容</handoff>
       // 如果内容为空，返回 None
       // 如果有内容，返回成员编号
   }
   ```
3. 修改 `extract_handoff_info` 函数：
   - 不再调用 AI API
   - 直接解析标签
   - 返回简化的结果（只包含目标角色）

**文件 2：`src-tauri/src/commands/handoff.rs`**

**修改内容**：
1. 简化返回结构（不再需要 task_summary 和 key_requirements）
2. 只返回：
   ```rust
   {
       "has_handoff": bool,
       "suggested_role": Option<String>,
       "full_message": String,  // 新增：前一个 AI 的完整消息
   }
   ```

### 3.2 前端文件

**文件 1：`src/components/HandoffConfirmDialog.tsx`** (如果存在)

**修改内容**：
1. **核心展示区域**：
   - 目标角色信息（名称、角色类型）
   - 用户输入框（额外说明）
   
2. **二级菜单（完整消息）**：
   - 默认折叠，不显示
   - 提供"查看完整消息"按钮
   - 点击后展开，显示前一个 AI 的完整响应
   - 展开区域支持滚动（max-height + overflow-y: auto）
   - 可以再次点击折叠

3. 确认按钮触发消息拼接和发送

**文件 2：消息发送逻辑**

**修改内容**：
1. 拼接消息格式：
   ```
   请接手工作，用户的需求是：[用户输入]
   
   前一个角色的最后一条信息是：
   ---
   [完整消息]
   ---
   ```
2. 发送给目标角色

---

## 4. 实施步骤

### 步骤 1：后端标签解析（30分钟）

**文件**：`src-tauri/src/handoff_observer.rs`

**任务**：
1. 添加标签解析函数：
   ```rust
   /// 从文本中解析 <handoff> 标签
   /// 返回：Some(成员编号) 或 None
   fn parse_handoff_tag(text: &str) -> Option<String> {
       use regex::Regex;
       
       let re = Regex::new(r"<handoff>(.*?)</handoff>").ok()?;
       let caps = re.captures(text)?;
       let content = caps.get(1)?.as_str().trim();
       
       if content.is_empty() {
           None
       } else {
           Some(content.to_string())
       }
   }
   ```

2. 注释掉 DeepSeek API 调用代码（保留以便将来恢复）

3. 创建新的简化函数：
   ```rust
   /// 简单标签解析（当前使用）
   pub fn extract_handoff_from_tag(
       last_message: &str,
   ) -> Result<HandoffInfo, String> {
       let target_id = parse_handoff_tag(last_message);
       
       Ok(HandoffInfo {
           has_handoff: target_id.is_some(),
           suggested_role: target_id,
           full_message: last_message.to_string(),
       })
   }
   ```

### 步骤 2：更新命令接口（20分钟）

**文件**：`src-tauri/src/commands/handoff.rs`

**任务**：
1. 修改调用逻辑，使用新的标签解析函数
2. 更新返回结构，添加 `full_message` 字段
3. 注释掉智能路由配置的加载逻辑

### 步骤 3：前端消息拼接（30分钟）

**文件**：前端交接相关组件

**任务**：
1. 修改交接确认对话框：
   - 显示完整消息预览（可折叠）
   - 添加用户输入框（额外说明）
   - 更新确认按钮逻辑

2. 实现消息拼接逻辑：
   ```typescript
   function buildHandoffMessage(
     userInput: string,
     previousMessage: string
   ): string {
     const userPart = userInput.trim() 
       ? `请接手工作，用户的需求是：${userInput}\n\n`
       : '请接手工作\n\n';
     
     return `${userPart}前一个角色的最后一条信息是：\n---\n${previousMessage}\n---`;
   }
   ```

### 步骤 4：测试验证（30分钟）

**测试场景**：
1. AI 输出 `<handoff>b</handoff>` → 应该提取到 "b"
2. AI 输出 `<handoff></handoff>` → 应该返回 None
3. AI 输出无标签 → 应该返回 None
4. 用户添加额外说明 → 消息应该正确拼接
5. 用户不添加说明 → 消息应该只包含完整消息

---

## 5. 验证计划

### 5.1 单元测试

**测试文件**：`src-tauri/src/handoff_observer.rs`

**测试用例**：
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_handoff_with_content() {
        let text = "这是一些文本 <handoff>b</handoff> 更多文本";
        assert_eq!(parse_handoff_tag(text), Some("b".to_string()));
    }

    #[test]
    fn test_parse_handoff_empty() {
        let text = "这是一些文本 <handoff></handoff> 更多文本";
        assert_eq!(parse_handoff_tag(text), None);
    }

    #[test]
    fn test_parse_handoff_no_tag() {
        let text = "这是一些文本，没有标签";
        assert_eq!(parse_handoff_tag(text), None);
    }

    #[test]
    fn test_parse_handoff_whitespace() {
        let text = "<handoff>  </handoff>";
        assert_eq!(parse_handoff_tag(text), None);
    }
}
```

### 5.2 集成测试

**测试流程**：
1. 创建包含多个角色的任务
2. 向 Alice (Product Manager) 发送消息
3. 等待 AI 响应，确认包含 `<handoff>b</handoff>`
4. 验证后端正确解析出目标角色 "b"
5. 验证前端弹出交接确认对话框
6. 输入额外说明，点击确认
7. 验证消息正确拼接并发送给 bob

### 5.3 日志验证

**关键日志**：
```
[Handoff Observer] 解析标签: <handoff>b</handoff>
[Handoff Observer] 提取目标: b
[Handoff Observer] 查找角色: bob (Backend Developer)
[Handoff Command] 返回结果 - has_handoff: true
[Handoff Command] 返回结果 - suggested_role: bob
```

---

## 6. 成功标准

只有当以下所有条件都满足时，才认为功能完成：

### 6.1 后端功能
- [ ] 标签解析函数正确实现
- [ ] 能正确解析 `<handoff>b</handoff>` 格式
- [ ] 空标签 `<handoff></handoff>` 返回 None
- [ ] 无标签时返回 None
- [ ] DeepSeek 代码已注释但保留
- [ ] 单元测试全部通过

### 6.2 前端功能
- [ ] 交接确认对话框显示完整消息
- [ ] 用户可以输入额外说明
- [ ] 消息拼接格式正确
- [ ] 发送给目标角色成功

### 6.3 用户体验
- [ ] 交接响应速度快（< 1秒）
- [ ] 完整消息可读性好
- [ ] 用户输入框清晰易用
- [ ] 无额外 API 调用成本

### 6.4 向后兼容
- [ ] 现有任务不受影响
- [ ] DeepSeek 代码可以快速恢复
- [ ] 数据库结构无需修改

---

## 7. 风险评估

### 7.1 标签解析失败

**风险**：AI 可能输出格式不正确的标签

**缓解措施**：
- 使用宽松的正则表达式
- 添加日志记录解析失败的情况
- 如果解析失败，默认为不交接

### 7.2 完整消息过长

**风险**：AI 响应可能很长，影响阅读体验

**缓解措施**：
- 在对话框中使用可折叠预览
- 显示前 500 字符，其余折叠
- 提供"展开全部"按钮

### 7.3 用户不理解新格式

**风险**：用户可能不习惯新的消息格式

**缓解措施**：
- 在对话框中添加说明文字
- 提供示例格式
- 保持格式简洁清晰

---

## 8. 后续优化方向

### 8.1 智能摘要（可选）
- 如果完整消息过长（> 2000 字符）
- 可以考虑恢复智能路由生成摘要
- 但保留完整消息作为备选

### 8.2 历史消息上下文
- 不仅转发最后一条消息
- 可以包含最近 3-5 条对话
- 提供更完整的上下文

### 8.3 自定义转发格式
- 允许用户自定义消息拼接格式
- 提供模板变量（如 {user_input}, {previous_message}）
- 保存用户偏好设置

---

## 9. 总结

### 核心改进
1. **更简单**：从 AI API 调用改为简单标签解析
2. **更快**：响应时间从 ~7秒 降至 < 1秒
3. **更准确**：AI 自己决定交接目标
4. **完整上下文**：转发完整消息，不丢失信息
5. **零成本**：无额外 API 费用

### 关键优势
- 利用 AI 已经输出的标签信息
- 保留完整上下文，避免信息丢失
- 用户可以添加额外说明
- 代码更简单，维护成本更低

### 实施建议
1. 先完成后端标签解析
2. 再实现前端消息拼接
3. 充分测试各种场景
4. 保留 DeepSeek 代码以便将来恢复

---

**文档版本**：1.0  
**最后更新**：2026-05-05  
**状态**：待审阅
