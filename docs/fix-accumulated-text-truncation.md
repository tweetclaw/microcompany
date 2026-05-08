# 修复 AI 工作中断问题：文本累积不完整

## 问题描述

### 症状
AI 在流式输出过程中，生成的文本被截断，只显示部分内容后就停止工作。

### 具体表现
从 dev.log 日志中可以看到：
```
AI response received, length: 1279 chars, has_visible_text=true
Using accumulated streaming text instead of extracted text: accumulated_chars=665 extracted_chars=0
```

- AI 实际生成了 1279 个字符
- 但只有 665 个字符被保存和显示
- 有 614 个字符（1279 - 665 = 614）丢失了

### 根本原因（已通过日志追踪确认）

通过添加详细日志追踪后，发现了两个独立的 bug：

#### Bug 1：普通 chat session 不应该执行 handoff 检测

**问题：** 当前代码无条件对所有 session（包括普通 chat session 和 task session）执行 handoff 检测逻辑。

**位置：** [src-tauri/src/claurst/mod.rs:1683-1687](src-tauri/src/claurst/mod.rs#L1683-L1687)

```rust
let parsed_handoff = if has_visible_text {
    extract_handoff_block(&text)  // 无条件执行，不区分 session 类型
} else {
    None
};
```

**影响：**
- 普通 chat session 不应该有 handoff 功能
- 如果 AI 的回复中恰好包含 `[HANDOFF]` 字符串（比如在解释代码或文档时），会被错误地当作 handoff 处理

#### Bug 2：handoff 检测不应该修改原始消息内容

**问题：** 当检测到 handoff block 时，代码直接用 `parsed.visible_text` 替换了整个消息内容，导致文本被截断。

**位置：** [src-tauri/src/claurst/mod.rs:1695-1697](src-tauri/src/claurst/mod.rs#L1695-L1697)

```rust
if let Some(parsed) = parsed_handoff.as_ref() {
    text = parsed.visible_text.clone();  // 直接替换整个消息内容
}
```

**影响：**
- 原始消息被截断，丢失了 handoff block 之后的所有内容
- 从日志可以看到：累积了 1279 字符，但最终只剩 665 字符

**日志证据：**
```
📝 [Accumulate] ... accumulated_after=1279  (累积过程正常)
🔄 [TurnComplete] accumulated_text_len=1279  (Turn 完成时正常)
📊 [Final] accumulated_chars=665 extracted_chars=0  (最终使用时被截断)
AI response received, length: 1279 chars  (AI 实际生成了 1279 字符)
```

**设计原则：**
- Handoff 信息应该只被读取，不应该修改原始消息
- Handoff suggestion 应该作为元数据单独处理，由前端决定如何展示
- 原始消息内容应该完整保存，包括 handoff block

---

## 修复方案

### Bug 1 修复：只在 task session 中执行 handoff 检测

**修改位置：** [src-tauri/src/claurst/mod.rs:1683-1687](src-tauri/src/claurst/mod.rs#L1683-L1687)

**修改前：**
```rust
let parsed_handoff = if has_visible_text {
    extract_handoff_block(&text)  // 无条件执行
} else {
    None
};
```

**修改后：**
```rust
// Only check for handoff in task sessions
let parsed_handoff = if task_session && has_visible_text {
    extract_handoff_block(&text)
} else {
    None
};
```

**验证：**
- 普通 chat session 不应该执行 handoff 检测
- Task session 应该正常执行 handoff 检测
- 日志应该显示 `is_task_session=false` 对于普通 session

---

### Bug 2 修复：不修改原始消息内容

**修改位置：** [src-tauri/src/claurst/mod.rs:1695-1706](src-tauri/src/claurst/mod.rs#L1695-L1706)

**修改前：**
```rust
if let Some(parsed) = parsed_handoff.as_ref() {
    text = parsed.visible_text.clone();  // 直接替换整个消息内容
}

let handoff_suggestion = parsed_handoff
    .and_then(|parsed| resolve_handoff_suggestion(&self.session_id, parsed));
```

**修改后：**
```rust
// IMPORTANT: Do NOT modify the text based on handoff detection
// We only read handoff information, not modify the original message
// The handoff suggestion will be handled separately by the frontend

let handoff_suggestion = parsed_handoff
    .and_then(|parsed| resolve_handoff_suggestion(&self.session_id, parsed));
```

**验证：**
- 原始消息内容应该完整保存，包括 handoff block
- Handoff suggestion 作为元数据单独处理
- 累积文本长度应该保持一致（不被截断）

---

### 当前代码结构

#### 1. 文本累积变量初始化
**位置：** [src-tauri/src/claurst/mod.rs:1101-1102](src-tauri/src/claurst/mod.rs#L1101-L1102)

```rust
let accumulated_streaming_text = Arc::new(parking_lot::Mutex::new(String::new()));
let event_accumulated_text = accumulated_streaming_text.clone();
```

#### 2. 流式文本累积逻辑
**位置：** [src-tauri/src/claurst/mod.rs:1180-1187](src-tauri/src/claurst/mod.rs#L1180-L1187)

```rust
ContentDelta::TextDelta { text } => {
    // Filter out system-reminder tags from streaming content
    let filtered_text = filter_system_tags(&text);

    // Only emit if there's content after filtering
    if !filtered_text.is_empty() {
        // Accumulate streaming text
        event_accumulated_text.lock().push_str(&filtered_text);
        // ...
    }
}
```

#### 3. 文本使用逻辑
**位置：** [src-tauri/src/claurst/mod.rs:1639-1647](src-tauri/src/claurst/mod.rs#L1639-L1647)

```rust
// Use accumulated streaming text if available and extracted text is empty
let accumulated_text = accumulated_streaming_text.lock().clone();
if extracted_text_was_empty && !accumulated_text.is_empty() {
    log::info!(
        "Using accumulated streaming text instead of extracted text: request_id={} accumulated_chars={} extracted_chars={}",
        request_id_owned,
        accumulated_text.chars().count(),
        extracted_text_before_fallback_chars
    );
    text = accumulated_text;
}
```

### 问题分析

1. **多 Turn 场景**
   - AI 在多个 turn 中生成文本（在工具调用之间）
   - 每个 turn 之间会触发 `TurnComplete` 事件
   - 但 `accumulated_streaming_text` 在整个请求期间应该持续累积所有 turn 的文本

2. **可能的原因**
   - `accumulated_streaming_text` 在某些情况下被重置或清空
   - 某些 turn 的文本没有被正确累积
   - 文本累积逻辑在某些条件下被跳过

3. **需要验证的假设**
   - 是否在 `TurnComplete` 事件处理中重置了累积文本？
   - 是否在某些条件下跳过了文本累积逻辑？
   - 是否有多个 `accumulated_streaming_text` 实例？

---

## 修复方案

### 方案 1：添加详细日志追踪（推荐先执行）

**目标：** 确认问题的确切原因

**步骤：**

1. **在文本累积处添加日志**
   
   **位置：** [src-tauri/src/claurst/mod.rs:1187](src-tauri/src/claurst/mod.rs#L1187)
   
   ```rust
   if !filtered_text.is_empty() {
       // Accumulate streaming text
       let mut acc = event_accumulated_text.lock();
       let before_len = acc.len();
       acc.push_str(&filtered_text);
       let after_len = acc.len();
       drop(acc);
       
       log::info!(
           "📝 [Accumulate] request_id={} chunk_len={} accumulated_before={} accumulated_after={}",
           event_request_id,
           filtered_text.len(),
           before_len,
           after_len
       );
       // ...
   }
   ```

2. **在 TurnComplete 事件处理中添加日志**
   
   **位置：** [src-tauri/src/claurst/mod.rs:1399](src-tauri/src/claurst/mod.rs#L1399)
   
   ```rust
   QueryEvent::TurnComplete { usage, .. } => {
       let accumulated_len = event_accumulated_text.lock().len();
       log::info!(
           "🔄 [TurnComplete] request_id={} accumulated_text_len={}",
           event_request_id,
           accumulated_len
       );
       // ... 现有代码
   }
   ```

3. **在最终使用累积文本时添加日志**
   
   **位置：** [src-tauri/src/claurst/mod.rs:1639](src-tauri/src/claurst/mod.rs#L1639)
   
   ```rust
   let accumulated_text = accumulated_streaming_text.lock().clone();
   log::info!(
       "📊 [Final] request_id={} accumulated_chars={} extracted_chars={} will_use_accumulated={}",
       request_id_owned,
       accumulated_text.chars().count(),
       text.chars().count(),
       extracted_text_was_empty && !accumulated_text.is_empty()
   );
   ```

4. **重新编译并测试**
   ```bash
   cargo build --manifest-path src-tauri/Cargo.toml
   ```

5. **分析新日志**
   - 检查每个 chunk 是否都被累积
   - 检查 TurnComplete 时累积文本的长度
   - 检查最终使用时累积文本的长度
   - 找出文本丢失的确切位置

---

### 方案 2：修复文本累积逻辑（根据日志分析结果）

#### 假设 A：TurnComplete 时累积文本被重置

**如果日志显示：** TurnComplete 后累积文本长度变为 0

**修复方案：**
- 检查 TurnComplete 事件处理代码，确保不会重置 `accumulated_streaming_text`
- 确保 `accumulated_streaming_text` 在整个请求期间持续累积

#### 假设 B：某些 turn 的文本没有被累积

**如果日志显示：** 某些流式输出块没有对应的累积日志

**修复方案：**
- 检查文本累积的条件判断逻辑
- 确保所有 `TextDelta` 事件都会触发累积逻辑
- 检查 `filter_system_tags` 是否过滤掉了太多内容

#### 假设 C：多个 turn 的文本被覆盖而不是追加

**如果日志显示：** 累积文本长度在某个时刻突然减少

**修复方案：**
- 检查是否有代码在某些情况下重新创建了 `accumulated_streaming_text`
- 确保使用 `push_str` 而不是直接赋值

---

### 方案 3：重构文本累积逻辑（如果问题复杂）

**如果上述方案都无法解决问题，考虑重构：**

1. **将文本累积逻辑与 timeline 累积逻辑统一**
   - 当前 timeline 正确累积了所有 output 项
   - 可以从 timeline 中提取所有 output 项的 content 来构建完整文本

2. **实现方案：**
   
   **位置：** [src-tauri/src/claurst/mod.rs:1639](src-tauri/src/claurst/mod.rs#L1639)
   
   ```rust
   // Extract text from timeline output items as fallback
   let timeline_text = {
       let items = timeline_items.lock();
       items.iter()
           .filter(|item| item.item_type == "output")
           .filter_map(|item| item.content.as_ref())
           .map(|s| s.as_str())
           .collect::<Vec<_>>()
           .join("")
   };
   
   let accumulated_text = accumulated_streaming_text.lock().clone();
   
   // Use the longer text (more complete)
   let text_to_use = if timeline_text.len() > accumulated_text.len() {
       log::info!(
           "Using timeline text (more complete): timeline_chars={} accumulated_chars={}",
           timeline_text.len(),
           accumulated_text.len()
       );
       timeline_text
   } else {
       accumulated_text
   };
   
   if extracted_text_was_empty && !text_to_use.is_empty() {
       text = text_to_use;
   }
   ```

---

## 实施步骤

### 第一阶段：诊断（1-2 小时）

1. ✅ 实施方案 1：添加详细日志
2. ✅ 重新编译后端
3. ✅ 触发问题场景（让 AI 执行多个工具调用的任务）
4. ✅ 分析日志，确认问题的确切原因

### 第二阶段：修复（2-4 小时）

1. ✅ 根据日志分析结果，选择合适的修复方案
2. ✅ 实施修复
3. ✅ 重新编译后端
4. ✅ 测试修复效果

### 第三阶段：验证（1-2 小时）

1. ✅ 测试多种场景：
   - 单 turn 文本输出
   - 多 turn 文本输出（工具调用之间）
   - 长文本输出
   - 短文本输出
2. ✅ 确认所有场景下文本都完整显示
3. ✅ 清理调试日志（可选）

---

## 测试用例

### 测试用例 1：多 Turn 场景
**输入：** 让 AI 执行需要多次工具调用的任务
**预期：** 所有 turn 的文本都应该被完整保存和显示

### 测试用例 2：长文本输出
**输入：** 让 AI 生成长篇回复（超过 1000 字符）
**预期：** 完整文本都应该被保存和显示

### 测试用例 3：工具调用之间的文本
**输入：** 让 AI 在每次工具调用前后都输出说明文字
**预期：** 所有说明文字都应该被完整保存和显示

---

## 相关文件

- [src-tauri/src/claurst/mod.rs](src-tauri/src/claurst/mod.rs) - 主要修复位置
- [dev.log](dev.log) - 日志分析来源

---

## 注意事项

1. **不要影响现有功能**
   - 修复时要确保不影响单 turn 场景的正常工作
   - 确保 timeline 累积逻辑不受影响

2. **性能考虑**
   - 文本累积是高频操作，避免引入性能问题
   - 使用 `push_str` 而不是字符串拼接

3. **日志清理**
   - 诊断完成后，可以考虑清理或降低日志级别
   - 保留关键日志用于未来调试

---

## 后续优化

修复完成后，可以考虑以下优化：

1. **统一文本来源**
   - 考虑只使用 timeline 作为文本来源
   - 简化文本累积逻辑

2. **添加单元测试**
   - 为文本累积逻辑添加单元测试
   - 覆盖多 turn 场景

3. **改进错误处理**
   - 添加文本丢失检测
   - 在检测到文本丢失时记录警告日志
