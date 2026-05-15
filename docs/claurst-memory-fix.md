# claurst 记忆功能修复方案

## 背景

claurst 内置了会话记忆提取机制，可以在对话结束后自动提取关键事实并持久化。但当前应用未正确注入这些记忆，导致记忆功能形同虚设。

## claurst 记忆机制说明

**写入逻辑（claurst 自动执行）：**

- 触发条件：消息数 ≥ 20 条，且距上次提取有 ≥ 3 次新工具调用
- 提取方式：调用 Claude API，分析对话内容，提取结构化事实
- 写入路径：`{working_dir}/.claurst/AGENTS.md`
- 记忆分类：
  - `user-preference` — 用户偏好
  - `project-fact` — 项目事实
  - `code-pattern` — 代码模式
  - `decision` — 决策记录
  - `constraint` — 约束条件

**注入逻辑（当前缺失）：**

claurst 通过 `QueryConfig.append_system_prompt` 字段将内容追加到系统提示词。但当前 `mod.rs` 在构建 `QueryConfig` 时，从未读取 `.claurst/AGENTS.md`，也未设置 `append_system_prompt`，导致记忆写入后永远不会被 AI 看到。

## 问题定位

- 文件：`src-tauri/src/claurst/mod.rs`
- 位置：`QueryConfig` 初始化部分（约 830 行）
- 症状：`.claurst/AGENTS.md` 从未被创建，即使创建了也不会注入

## 修复方案

在 `mod.rs` 初始化 `QueryConfig` 后，读取 `{working_dir}/.claurst/AGENTS.md`，将内容注入到 `query_config.append_system_prompt`。

```rust
// 在 query_config.max_turns = 50; 之后添加：

// 注入 claurst 会话记忆（如果存在）
let agents_md_path = working_dir.join(".claurst").join("AGENTS.md");
if let Ok(memory_content) = std::fs::read_to_string(&agents_md_path) {
    if !memory_content.trim().is_empty() {
        let memory_section = format!(
            "\n\n---\n## 📚 项目记忆（自动提取）\n\n{}", 
            memory_content.trim()
        );
        query_config.append_system_prompt = Some(memory_section);
        log::info!(
            "🧠 [MEMORY] Injected AGENTS.md into append_system_prompt: {} chars",
            memory_content.len()
        );
    }
}
```

## 注意事项

1. 只需在每次新建 session（`ClaurstSession::new`）时注入一次，不需要每轮重新读取
2. 如果 `append_system_prompt` 已有内容（如 managed agent 模式），需要追加而非覆盖
3. `AGENTS.md` 不存在时静默跳过，不影响正常流程
4. 该记忆是项目级别的，对普通对话和 task 对话都应注入

## 当前状态

- [x] 机制已调研清楚
- [ ] 修复代码未实施
- [ ] 需验证 `.claurst/AGENTS.md` 是否能被正常写入（依赖 `ANTHROPIC_API_KEY` 环境变量）
