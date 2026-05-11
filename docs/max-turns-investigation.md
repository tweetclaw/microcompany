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

## 行业研究：其他 AI Agents 的解决方案

### 常见的处理策略

#### 1. Continue/Resume 机制
**代表产品：ChatGPT, Claude.ai, Cursor**

- **ChatGPT**: 提供 "Continue generating" 按钮，用户点击后从上次停止处继续
- **Claude.ai**: 用户可以输入 "continue" 或 "keep going"，AI 会继续之前的任务
- **Cursor**: 自动检测未完成的代码变更，提示用户是否继续

**优点：**
- 简单直接，用户体验好
- 保持上下文连续性
- 用户有控制权

**缺点：**
- 需要用户手动触发
- 可能导致无限循环（用户一直点继续）

#### 2. 动态限制调整
**代表产品：Aider, GitHub Copilot Workspace**

- 根据任务复杂度动态调整 max_turns
- 检测任务进度，如果接近完成则自动延长限制
- 使用启发式规则判断是否需要更多轮次

**优点：**
- 自动化，无需用户干预
- 更智能的资源分配

**缺点：**
- 实现复杂
- 可能误判任务完成度

#### 3. 任务分解
**代表产品：AutoGPT, BabyAGI**

- 将大任务分解为多个小任务
- 每个小任务在限制内完成
- 自动链接多个任务的结果

**优点：**
- 适合复杂的长期任务
- 每个子任务都有明确的目标

**缺点：**
- 需要强大的任务规划能力
- 可能丢失全局视角

#### 4. 智能停止检测
**代表产品：Devin, Codex**

- 不仅基于轮次，还基于任务完成度
- 检测 AI 是否在循环或卡住（重复相同的操作）
- 检测工具调用模式，判断是否有进展

**优点：**
- 避免无意义的循环
- 更精准的停止时机

**缺点：**
- 需要复杂的模式识别
- 可能误判正常的迭代过程

#### 5. 用户确认机制
**代表产品：Claude Code (Kiro CLI)**

- 接近限制时（如剩余3轮）提示用户
- 让用户决定是继续还是停止
- 显示当前进度和剩余轮次

**优点：**
- 用户有充分的控制权
- 避免突然中断
- 透明度高

**缺点：**
- 需要用户关注和决策
- 可能打断工作流

## claurst 的现有机制

### 配置系统
```rust
// 默认值
pub const MAX_TURNS_DEFAULT: u32 = 10;

// 配置优先级
effective_max_turns = agent.max_turns ?? config.max_turns ?? MAX_TURNS_DEFAULT
```

### 智能计数
- **失败重试不计入**：API 错误或临时失败的尝试不计入 max_turns
- **灵活配置**：可通过 agent definition 为不同任务设置不同限制

### 当前问题
1. **硬性限制**：达到限制后立即停止，无缓冲
2. **无继续机制**：用户无法恢复中断的任务
3. **缺乏透明度**：用户不知道剩余轮次

## 针对我们应用的建议方案

### 方案 1：添加 Continue 按钮（推荐 - 短期）
**实施难度：低**

**实现方式：**
1. 当检测到 max_turns 终止时，在界面显示 "Continue" 按钮
2. 用户点击后，发送一个简单的消息（如 "continue" 或 "请继续"）
3. AI 从上次停止处继续工作

**优点：**
- 实现简单，无需修改 claurst
- 用户体验好，类似 ChatGPT
- 保持上下文连续性

**实施步骤：**
1. 在 `ChatInterface.tsx` 中检测 max_turns 终止
2. 显示特殊的 UI 提示和 Continue 按钮
3. 点击时自动发送 "continue" 消息

### 方案 2：轮次进度显示（推荐 - 短期）
**实施难度：低**

**实现方式：**
1. 在 Inspector 面板显示当前轮次和限制（如 "15/25 轮"）
2. 接近限制时（如剩余5轮）显示警告
3. 让用户提前知道即将达到限制

**优点：**
- 透明度高
- 用户可以提前调整策略
- 无需修改核心逻辑

**实施步骤：**
1. 从后端事件中提取当前 turn 和 effective_max_turns
2. 在 InspectorPanel 添加进度显示组件
3. 添加警告阈值逻辑

### 方案 3：动态限制调整（中期）
**实施难度：中**

**实现方式：**
1. 分析任务类型，为不同任务设置不同的 max_turns
2. 简单查询：10 轮
3. 代码修改：25 轮
4. 复杂重构：50 轮

**优点：**
- 更合理的资源分配
- 减少不必要的限制

**缺点：**
- 需要任务分类逻辑
- 可能需要修改 claurst 配置

### 方案 4：智能循环检测（长期）
**实施难度：高**

**实现方式：**
1. 监控工具调用模式
2. 检测重复的失败操作
3. 检测无进展的循环
4. 提前终止无意义的循环

**优点：**
- 避免浪费资源
- 更智能的停止策略

**缺点：**
- 实现复杂
- 需要大量测试

## 实施优先级

### 立即实施（本周）
1. ✅ **显示 max_turns 错误提示**（已完成）
2. **添加 Continue 按钮**（方案1）
3. **显示轮次进度**（方案2）

### 短期实施（本月）
4. **优化错误提示文案**（中英文）
5. **添加配置界面**（让用户调整 max_turns）

### 中期实施（下季度）
6. **动态限制调整**（方案3）
7. **任务类型识别**

### 长期研究（待定）
8. **智能循环检测**（方案4）
9. **与 claurst 团队协作**（如果可能）

## 结论

### 问题确认
AI 会在达到 25 轮时停止，这是 claurst 的内置限制（默认10轮，我们配置为25轮）。

### 行业对比
其他 AI coding agents 主要采用以下策略：
1. **Continue 机制**（ChatGPT, Claude.ai）- 最常见
2. **动态限制**（Aider, Copilot）- 较智能
3. **任务分解**（AutoGPT）- 适合复杂任务
4. **智能检测**（Devin）- 最先进
5. **用户确认**（Claude Code）- 最透明

### 推荐方案
**短期（本周）：**
- ✅ 显示 max_turns 错误提示（已完成）
- 添加 Continue 按钮（方案1 - 最优先）
- 显示轮次进度（方案2）

**中长期：**
- 动态限制调整（方案3）
- 智能循环检测（方案4）

### 技术可行性
所有推荐方案都**无需修改 claurst 源码**，可以在应用层实现。

### 预期效果
实施方案1和2后，用户体验将显著改善：
- 用户知道为什么停止（透明度）
- 用户可以继续任务（控制权）
- 用户可以提前准备（可预测性）
