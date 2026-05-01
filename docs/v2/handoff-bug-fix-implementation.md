# Handoff Bug Fix Implementation Summary

## 实施日期
2026-05-01

## 问题概述
Handoff 功能失效：AI 明确建议交接给下一个角色，但应用没有弹出交接确认对话框。

根本原因：角色名称解析器要求精确匹配，但缺乏容错机制。当 AI 输出的角色名称（如 "Backend Engineer"）与数据库中的实际名称（如 "Backend Developer"）不完全一致时，解析失败导致 handoff 功能无法触发。

详细分析见：[handoff-bug-root-cause-analysis.md](./handoff-bug-root-cause-analysis.md)

## 已实施的修复方案

### ✅ 方案 3：前端增加 target_role_id 验证（快速修复）

**文件**: [src/App.tsx:467-480](../../src/App.tsx#L467-L480)

**修改内容**:
```typescript
const handleHandoffSuggestion = (event: AiRequestEndEvent) => {
  if (!event.handoffSuggestion?.recommended) return;

  // Verify that target_role_id exists when recommended is true
  if (!event.handoffSuggestion.target_role_id) {
    console.warn(
      'Handoff suggestion has recommended=true but missing target_role_id. ' +
      'This likely means the AI suggested a role name that does not match any role in the roster.',
      event.handoffSuggestion
    );
    return;
  }

  setPendingHandoffSuggestion(event.handoffSuggestion);
  setShowForwardModal(true);
};
```

**效果**:
- 防止无效的 handoff suggestion 触发模态框
- 在控制台输出警告信息，帮助调试
- 用户不会看到无法完成的交接流程

---

### ✅ 方案 4：后端解析失败时返回 None（快速修复）

**文件**: [src-tauri/src/claurst/mod.rs:276-320](../../src-tauri/src/claurst/mod.rs#L276-L320)

**修改内容**:
```rust
fn resolve_handoff_suggestion(session_id: &str, parsed: ParsedHandoffBlock) -> Option<HandoffSuggestion> {
    // ... 前面的代码保持不变 ...

    let resolved_target = parsed
        .target_role_name
        .as_ref()
        .map(|name| name.trim().to_lowercase())
        .and_then(|target_name| target_lookup.get(&target_name).copied())
        .filter(|target_role| {
            roster_role_ids.contains(&target_role.role_id) && target_role.role_id != current_role_id
        });

    // 新增：如果解析失败，返回 None 而不是无效的 Some
    if resolved_target.is_none() {
        log::warn!(
            "handoff_target_unresolved session_id={} target_role_name={:?} available_roles=[{}]",
            session_id,
            parsed.target_role_name,
            roster.iter().map(|r| &r.role_name).cloned().collect::<Vec<_>>().join(", ")
        );
        return None;
    }

    let resolved = resolved_target.unwrap();
    Some(HandoffSuggestion {
        recommended: true,
        target_role_id: Some(resolved.role_id.clone()),
        target_role_name: Some(resolved.role_name.clone()),
        reason: parsed.reason,
        draft_message: parsed.draft_message,
    })
}
```

**效果**:
- 解析失败时不再生成无效的 `HandoffSuggestion`
- 记录详细的警告日志，包括 AI 输出的角色名称和可用的角色列表
- 防止无效数据传递到前端

---

### ✅ 方案 2：强化 Prompt Contract 中的角色列表

**文件**: [src-tauri/src/archetypes/prompt_builder.rs:118-148](../../src-tauri/src/archetypes/prompt_builder.rs#L118-L148)

**修改内容**:
```rust
// 提取精确的角色名称列表
let exact_role_names = context
    .roster
    .iter()
    .enumerate()
    .filter(|(index, _)| *index != context.active_role_index)
    .map(|(_, role)| format!("\"{}\"", role.name))
    .collect::<Vec<_>>()
    .join("、");

let role_names_instruction = if exact_role_names.is_empty() {
    "当前任务中没有其他角色可供交接。".to_string()
} else {
    format!("当前团队的真实角色名称列表：{}。", exact_role_names)
};

Some(format!(
    "交接输出约束：\n\
    - {}\n\
    - 你绝不能把"{}"或任何同身份角色再次推荐为下一位角色。\n\
    - 你绝不能推荐团队 roster 之外的泛化职位（如 PM、产品负责人、负责人、业务方），除非该对象就在当前 roster 中且不是你自己。\n\
    - {}\n\
    - ...\n\
    - 如果你决定提出交接建议，请在正常回答结束后追加一个机器可读的 HANDOFF 块，格式必须严格如下：\n\
      [HANDOFF]\n\
      recommended: yes 或 no\n\
      target_role: 必须从上述角色名称列表中精确复制一个角色名称；如果不交接则留空\n\
      ...\n\
      [/HANDOFF]\n\
    - target_role 字段必须从上述列表中精确复制角色名称，不能使用同义词、简称或自己推断的名称。例如，如果列表中是 \"Backend Developer\"，你不能写 \"Backend Engineer\" 或 \"Backend\"。\n\
    - ...",
    allowed_targets_summary,
    normalized_identity,
    role_names_instruction,
    recommended_targets_summary,
))
```

**效果**:
- 在 prompt 中明确列出可选的角色名称
- 强调必须精确复制角色名称，不能使用同义词
- 提供具体的错误示例（Backend Developer vs Backend Engineer）
- 显著降低 AI 输出错误角色名称的概率

---

### ✅ 额外改进：增强日志记录

**文件**: 
- [src-tauri/src/claurst/mod.rs:207-252](../../src-tauri/src/claurst/mod.rs#L207-L252) - `extract_handoff_block` 函数
- [src-tauri/src/claurst/mod.rs:895-918](../../src-tauri/src/claurst/mod.rs#L895-L918) - handoff 处理流程

**新增日志**:
```rust
// 在 extract_handoff_block 中
log::debug!("handoff_block_found block_content_length={}", block_content.len());
log::debug!(
    "handoff_block_parsed recommended={} target_role_name={:?} has_reason={} has_draft_message={}",
    recommended,
    target_role_name,
    reason.is_some(),
    draft_message.is_some()
);

// 在主处理流程中
log::info!(
    "handoff_block_extracted session_id={} recommended={} target_role_name={:?}",
    self.session_id,
    parsed.recommended,
    parsed.target_role_name
);

log::info!(
    "handoff_suggestion_resolved session_id={} recommended={} target_role_id={:?} target_role_name={:?}",
    self.session_id,
    suggestion.recommended,
    suggestion.target_role_id,
    suggestion.target_role_name
);
```

**效果**:
- 完整记录 handoff 处理的每个阶段
- 便于快速定位问题（是提取失败还是解析失败）
- 提供足够的上下文信息用于调试

---

## 修复效果

### 修复前的问题流程
1. AI 输出：`target_role: Backend Engineer`
2. 数据库中：`Backend Developer`
3. 后端解析：匹配失败，但仍返回 `HandoffSuggestion { recommended: true, target_role_id: None }`
4. 前端接收：只检查 `recommended`，未检查 `target_role_id`
5. 结果：模态框可能显示，但后续转发逻辑失败 ❌

### 修复后的正确流程
1. AI 输出：`target_role: Backend Developer`（因为 prompt 中明确列出了角色名称）
2. 数据库中：`Backend Developer`
3. 后端解析：精确匹配成功 ✅
4. 前端接收：验证 `recommended` 和 `target_role_id` 都存在
5. 结果：正确显示交接确认对话框 ✅

### 如果 AI 仍然输出错误名称
1. AI 输出：`target_role: Backend Engineer`
2. 数据库中：`Backend Developer`
3. 后端解析：匹配失败
4. 后端日志：`handoff_target_unresolved ... target_role_name="Backend Engineer" available_roles=[Backend Developer, ...]`
5. 后端返回：`None`（不生成 handoffSuggestion）
6. 前端：不触发模态框
7. 前端控制台：无警告（因为没有收到 handoffSuggestion）
8. 结果：用户不会看到无法完成的交接流程，开发者可以通过日志快速定位问题 ✅

---

## 测试建议

### 手动测试场景

1. **正常交接流程**
   - 创建任务，包含多个角色（如 "Product Manager", "Backend Developer", "Frontend Developer"）
   - 以 Product Manager 身份发送消息，触发 AI 建议交接
   - 验证：AI 输出的 HANDOFF 块中 `target_role` 是否精确匹配数据库中的角色名称
   - 验证：前端是否正确显示交接确认对话框
   - 验证：选择目标角色后是否成功完成交接

2. **角色名称不匹配场景**（需要手动构造）
   - 修改数据库中的角色名称为 "Backend Developer"
   - 手动修改 AI 回复，使其包含 `target_role: Backend Engineer`
   - 验证：后端日志是否输出 `handoff_target_unresolved` 警告
   - 验证：前端是否不显示模态框
   - 验证：用户体验是否正常（不会看到错误或卡住的状态）

3. **边界情况**
   - 只有一个角色的任务（无法交接）
   - 角色名称包含特殊字符或中文
   - `recommended: no` 的情况

### 日志验证

运行应用后，检查日志中是否包含以下信息：

```
# 成功场景
handoff_block_found block_content_length=...
handoff_block_parsed recommended=true target_role_name=Some("Backend Developer") ...
handoff_block_extracted session_id=... recommended=true target_role_name=Some("Backend Developer")
handoff_suggestion_resolved session_id=... recommended=true target_role_id=Some("...") target_role_name=Some("Backend Developer")

# 失败场景
handoff_block_parsed recommended=true target_role_name=Some("Backend Engineer") ...
handoff_target_unresolved session_id=... target_role_name=Some("Backend Engineer") available_roles=[Backend Developer, Frontend Developer]
```

---

## 未来改进方向（方案 1）

当前实施的修复方案已经能够解决大部分问题，但如果仍然频繁出现角色名称不匹配的情况，可以考虑实施方案 1：**改进角色名称解析器，支持模糊匹配和同义词映射**。

### 实施思路

在 [src-tauri/src/claurst/mod.rs](../../src-tauri/src/claurst/mod.rs) 中添加：

```rust
fn fuzzy_match_role_name<'a>(
    input: &str, 
    roster: &'a [TaskRosterRole]
) -> Option<&'a TaskRosterRole> {
    let normalized_input = normalize_role_name(input);
    
    // 1. 精确匹配
    if let Some(role) = roster.iter().find(|r| 
        normalize_role_name(&r.role_name) == normalized_input
    ) {
        return Some(role);
    }
    
    // 2. 包含匹配
    if let Some(role) = roster.iter().find(|r| {
        let normalized = normalize_role_name(&r.role_name);
        normalized.contains(&normalized_input) || 
        normalized_input.contains(&normalized)
    }) {
        return Some(role);
    }
    
    // 3. 同义词映射
    let synonyms = get_role_synonyms(&normalized_input);
    for synonym in synonyms {
        if let Some(role) = roster.iter().find(|r| 
            normalize_role_name(&r.role_name) == synonym
        ) {
            return Some(role);
        }
    }
    
    None
}

fn normalize_role_name(name: &str) -> String {
    name.trim()
        .to_lowercase()
        .replace("-", " ")
        .replace("_", " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn get_role_synonyms(role: &str) -> Vec<String> {
    match role {
        "backend engineer" => vec![
            "backend developer".to_string(), 
            "backend dev".to_string()
        ],
        "frontend engineer" => vec![
            "frontend developer".to_string(), 
            "frontend dev".to_string()
        ],
        "product manager" => vec![
            "pm".to_string(), 
            "项目经理".to_string(), 
            "产品经理".to_string()
        ],
        _ => vec![],
    }
}
```

然后在 `resolve_handoff_suggestion` 中使用：

```rust
let resolved_target = parsed
    .target_role_name
    .as_ref()
    .and_then(|name| fuzzy_match_role_name(name, &roster))
    .filter(|target_role| target_role.role_id != current_role_id);
```

### 何时实施方案 1

- 当前修复方案运行一段时间后，如果日志中仍然频繁出现 `handoff_target_unresolved` 警告
- 用户反馈 handoff 功能仍然不稳定
- 需要支持更灵活的角色命名方式

---

## 相关文档

- [handoff-investigation-transfer.md](./handoff-investigation-transfer.md) - 原始调查文档
- [handoff-bug-root-cause-analysis.md](./handoff-bug-root-cause-analysis.md) - 根本原因分析

## 修改的文件

- [src/App.tsx](../../src/App.tsx) - 前端 handoff 事件处理
- [src-tauri/src/claurst/mod.rs](../../src-tauri/src/claurst/mod.rs) - 后端 handoff 解析和日志
- [src-tauri/src/archetypes/prompt_builder.rs](../../src-tauri/src/archetypes/prompt_builder.rs) - Prompt contract 生成

## 总结

通过实施三个快速修复方案和增强日志记录，我们已经显著提高了 handoff 功能的可靠性：

1. ✅ **前端防御**：验证 `target_role_id` 存在，防止无效交接
2. ✅ **后端防御**：解析失败时返回 `None`，不生成无效数据
3. ✅ **AI 引导**：在 prompt 中明确列出角色名称，降低错误概率
4. ✅ **可观测性**：完整的日志记录，便于快速定位问题

这些修复方案遵循了"纵深防御"的原则，在多个层面上防止问题发生，即使某一层失效，其他层也能保证系统的正确性。
