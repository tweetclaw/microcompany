# 阶段 8：AI 工作状态、中断能力与过程展示改进方案

**版本**: 1.0  
**创建时间**: 2026-04-16  
**状态**: 待评审（仅方案，不改代码）

---

## 1. 背景与问题复盘

当前用户反馈是“全方位 bug”，核心不止是“看起来没在工作”，还包括：

1. AI 实际仍在执行，但 UI 可能显示为空闲。
2. 输入区中断按钮会提前消失，用户误以为任务结束。
3. “过程信息”和“最终回答”混在一起，阅读成本高且容易误解。

### 当前实现的关键断点（现状）

- 前端状态来源分裂：
  - `isLoading`（请求中）
  - `currentToolCall`（工具调用）
  - `message.isStreaming`（消息流式）
- `isLoading` 的结束时机不够严格，存在“请求生命周期”和“UI显示生命周期”不完全一致的风险。
- Inspector 的 Activity 只依赖 `currentToolCall`，如果 AI 在“思考/等待模型返回”而非“调用工具”，会显示“当前没有工具调用”。

结论：目前缺少一个**统一且可追踪的 AI 生命周期状态机**。

---

## 2. 改造目标（对应你的 3 条需求）

### 目标 A：统一识别 AI 当前状态
无论 AI 处于“思考、调用工具、生成回答、完成、取消、失败”哪个阶段，前后端都能明确表达并展示。

### 目标 B：中断按钮全程可靠
只要任务未进入终态（success/cancelled/error），中断按钮必须始终可用；只有真正终态才切回“发送”。

### 目标 C：过程信息与最终回答分层展示
将 AI 过程信息（状态、工具执行、阶段日志）与 AI 给用户的正式回答（Markdown 内容）做视觉与语义分离。

---

## 3. 总体设计

采用“三层一致性”设计：

1. **后端执行层（Rust）**：作为事实来源，发出标准化生命周期事件。
2. **前端状态层（React）**：维护单一状态机，避免多状态源冲突。
3. **UI 展示层**：按状态机渲染按钮、指示器、过程区和最终回答区。

---

## 4. 详细方案

## 4.1 后端事件协议升级（事实源统一）

在现有 `message-chunk` / `tool-call-start` / `tool-call-end` 之外，新增统一生命周期事件（命名可微调）：

- `ai-request-start`
  - 字段：`request_id`, `session_id`, `timestamp`
- `ai-status`
  - 字段：`request_id`, `phase`, `text`, `timestamp`
  - `phase` 枚举建议：`thinking | tool_running | generating | finalizing`
- `ai-request-end`
  - 字段：`request_id`, `result`
  - `result` 枚举建议：`success | cancelled | error`
  - 可附：`error_message`

> 说明：
> - 工具调用事件继续保留，但纳入同一 `request_id` 跟踪。
> - 不直接暴露模型私有推理全文；过程展示优先使用状态/工具事件，避免把“内部推理文本”当成最终答复。

---

## 4.2 前端状态机重构（单一真相源）

新增前端状态模型 `AiRunState`：

- `idle`
- `running_thinking`
- `running_tool`
- `running_generating`
- `finalizing`
- `cancelled`
- `error`
- `completed`

并维护：
- `activeRequestId: string | null`
- `canCancel: boolean`（由状态推导，不手工散落赋值）
- `isBusy: boolean`（`running_*` + `finalizing`）

### 关键约束

1. **移除“时间延迟式结束”逻辑**（例如固定 `setTimeout` 后置空闲）。
2. 仅在收到 `ai-request-end` 后进入终态。
3. 如果收到取消事件，立刻转 `cancelled` 并回收 UI。
4. 多事件并发时按 `request_id` 过滤，防止旧事件污染当前任务状态。

---

## 4.3 中断按钮可靠性策略

输入框按钮显示规则调整为：

- `isBusy === true` → 显示“中断”按钮（且可点击）。
- `isBusy === false` → 显示“发送”按钮。

### 行为细则

1. 点击中断后，前端进入 `finalizing`（等待后端确认），按钮仍显示“中断中…/中断”。
2. 收到 `ai-request-end: cancelled` 才切回发送按钮。
3. 若中断失败（例如无有效请求），保持当前状态并显示错误提示，不可静默切回发送。

---

## 4.4 过程信息 vs 最终回答：双通道展示

新增“过程事件流”（不写入正式消息历史）与“最终回答消息流”（写入历史）分离渲染：

### 过程事件流（Process Timeline）
来源：`ai-status` + `tool-call-start/end`

展示建议：
- 样式：弱强调、等宽字体、卡片/时间线风格、灰蓝色系。
- 标签：`思考中`、`工具执行中`、`生成回答中`、`已完成/已取消/失败`。
- 可折叠：默认折叠历史过程，仅展开当前运行过程，避免刷屏。

### 最终回答消息流（Assistant Answer）
来源：最终 assistant 正式内容（Markdown 渲染）

展示建议：
- 保持现有回答气泡风格。
- 绝不与过程日志混排在同一段文本中。

---

## 4.5 UI 一致性改造点

1. **Toolbar**：增加全局状态灯（Idle / Working / Cancelling / Error）。
2. **Inspector Activity**：从“仅工具调用”升级为“完整任务状态 + 最近工具事件”。
3. **MessageList 区**：在消息列表顶部或当前回复附近展示“过程时间线（可折叠）”。
4. **InputBox**：按钮严格由 `isBusy/canCancel` 驱动，不再依赖局部推断。

---

## 5. 影响文件（计划改动范围）

### Frontend
- `src/components/ChatInterface.tsx`（状态机主控）
- `src/components/InputBox.tsx`（发送/中断切换规则）
- `src/components/InspectorPanel.tsx`（Activity 升级）
- `src/components/Toolbar.tsx`（全局状态指示）
- `src/components/MessageList.tsx`（过程时间线挂载）
- `src/components/MessageItem.tsx`（回答保持独立）
- `src/types/index.ts`（新增状态/事件类型）
- 对应 CSS 文件（状态样式、时间线样式）

### Backend
- `src-tauri/src/claurst/mod.rs`（补充状态事件 emit）
- `src-tauri/src/commands/message.rs`（请求生命周期和 cancel 对齐）

---

## 6. 分阶段实施计划

### P1：状态协议打通（先做）
1. 后端补齐 `ai-request-start / ai-status / ai-request-end`。
2. 前端接入 `request_id` 与基础状态机。
3. 移除前端“定时结束”逻辑。

### P2：中断可靠性落地
4. 输入框基于状态机控制按钮展示。
5. 中断流程改为“请求终态驱动回收”。
6. 补齐取消失败提示与边界行为。

### P3：过程与回答分层展示
7. 引入 Process Timeline（可折叠）。
8. Inspector/Toolbar 状态统一。
9. 样式区分优化（过程弱强调、答案主阅读）。

---

## 7. 验收标准（必须满足）

### A. 状态正确性
- 在“纯思考但未调工具”阶段，UI 仍明确显示“AI 工作中”。
- 在工具调用阶段，UI 显示具体工具状态。
- 完成/取消/失败后统一进入终态，不残留忙碌态。

### B. 中断可用性
- AI 运行全过程可点击中断。
- 未收到终态前不允许切回“发送”。
- 取消后状态回收正确，无卡死。

### C. 展示分层
- 过程日志与最终回答视觉明显区分。
- 用户可快速判断“哪些是过程，哪些是给我的最终结果”。

---

## 8. 测试用例（关键场景）

1. **长思考无工具**：应持续显示 working + 可中断。
2. **多工具串行调用**：状态应在 tool_running 与 generating 间正确切换。
3. **流式输出中途中断**：最终应进入 cancelled，按钮恢复发送。
4. **后端异常**：进入 error，按钮恢复发送并提示错误。
5. **快速连发/重复点击中断**：无状态错乱、无旧事件污染。

---

## 9. 风险与规避

1. **事件乱序/迟到**
   - 规避：所有事件带 `request_id`，前端仅处理活跃请求。
2. **状态回收遗漏**
   - 规避：只允许 `ai-request-end` 触发终态；其他路径不直接置 idle。
3. **过程日志过多影响阅读**
   - 规避：过程区默认折叠、仅高亮当前步骤。

---

## 10. 结论

本方案的核心是把“AI 是否工作中”从“UI猜测”升级为“后端事件驱动 + 前端状态机驱动”，并将“过程信息”与“最终答复”彻底分层。

你确认后，我会按此方案进入实施阶段，先做 P1（状态协议与状态机），再做 P2/P3，保证每一步都可验收。
