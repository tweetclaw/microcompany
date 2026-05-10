# AI Max Turns 限制调查报告

## 调查时间
2026-05-10

## 问题描述
用户反馈 AI 会突然停止工作，怀疑是因为达到了某种轮次限制。需要找到硬证据并在界面上显示终止原因。

## 调查结论

### ✅ 证据确认
AI 确实会因为达到 **max_turns 限制（25 轮）** 而停止。

### 证据位置
**代码位置：** `claurst/src-rust/crates/query/src/lib.rs`

```rust
if turn > effective_max_turns {
    info!(
        event = "query_loop_max_turns_reached",
        turn,
        effective_max_turns,
        message_count = messages.len()
    );
    // ... 返回终止
}
```

### 日志证据
当达到限制时，日志会记录：
```
INFO claurst_query: Stopping query loop because max turns was reached 
event="query_loop_max_turns_reached" turn=26 effective_max_turns=25 message_count=70
```

### 配置位置
- 主会话配置：`effective_max_turns = 25`
- 配置文件：需要在 claurst 配置中查找

## 当前行为

### 后端行为
1. 当 `turn > effective_max_turns` 时，查询循环停止
2. 记录 `query_loop_max_turns_reached` 日志事件
3. 返回 `QueryOutcome::EndTurn`（与普通结束相同）

### 前端表现
- **问题**：max_turns 终止被当作普通的正常结束处理
- **用户体验**：用户无法区分是任务完成还是达到轮次限制
- **界面提示**：无明显提示

## 改进建议

### 理想方案（需要修改 claurst）
1. 在 `QueryOutcome` 枚举中添加 `MaxTurns` 变体
2. 在上层代码中捕获并显示专门的提示
3. 让用户明确知道是因为轮次限制而停止

### 当前限制
- **claurst 不归我们维护**，无法修改其源码
- 无法在 `QueryOutcome` 层面区分 max_turns 和普通 EndTurn
- 只能通过日志事件 `query_loop_max_turns_reached` 来事后确认

### 可行的替代方案
1. **监控日志**：通过解析日志中的 `query_loop_max_turns_reached` 事件来检测
2. **增加配置可见性**：在界面上显示当前的 max_turns 配置值
3. **用户教育**：在文档中说明 25 轮限制的存在

## 验证记录

### 测试案例
- **Request ID**: `53d7302a-40d8-4e37-a120-52c73c2009bf`
- **执行轮次**: 26 轮（触发限制）
- **消息数量**: 70 条
- **终止时间**: 2026-05-10 14:01:10
- **日志确认**: ✅ 存在 `query_loop_max_turns_reached` 事件

## 相关文件
- `claurst/src-rust/crates/query/src/lib.rs` - 主查询循环逻辑
- `src-tauri/src/claurst/mod.rs` - Tauri 层 claurst 集成
- `src/components/ChatInterface.tsx` - 前端聊天界面
- `src/types/index.ts` - TypeScript 类型定义

## 结论
**问题已确认**：AI 会在达到 25 轮时停止，这是 claurst 的内置限制。由于无法修改 claurst 源码，当前无法在界面上直接显示此终止原因。建议通过文档和配置可见性来改善用户体验。
