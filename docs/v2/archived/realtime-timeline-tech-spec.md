# 实时 Timeline 展示 — 技术说明

**文档类型**: 技术架构说明  
**创建日期**: 2026-05-08  
**状态**: ✅ 已实现

---

## 1. 功能概述

本功能实现了 AI 对话过程的**实时时间线展示**，让用户能够：

- 实时看到 AI 的思考过程（thinking）
- 实时看到 AI 的工具调用（tool call）及其状态变化
- 实时看到 AI 的输出内容（output）
- 所有内容**按时间顺序穿插展示**，而非分区域隔离展示

### 1.1 对比旧实现

| 旧实现 | 新实现 |
|--------|--------|
| 只在消息完成后从数据库读取 timeline | 实时流式收集并展示 |
| 分区域展示（AI 回答顶部、工具底部） | 按时间顺序穿插展示 |
| 缺少工具调用的实时反馈 | 工具调用开始/结束时立即反映 |
| 无 thinking 过程展示 | thinking 可折叠展示 |

---

## 2. 架构设计

### 2.1 数据流

```
后端 Claurst 引擎
  │
  ├─ thinking-chunk 事件 ──→ 前端 ChatInterface 监听
  ├─ tool-call-start 事件 ──→ 前端 ChatInterface 监听
  ├─ tool-call-end 事件 ──→ 前端 ChatInterface 监听
  └─ message-chunk 事件 ──→ 前端 ChatInterface 监听
                 │
                 ▼
         requestTimelines Map
           (keyed by requestId)
                 │
                 ▼
      updateStreamingAssistantMessage()
           (实时注入到 Message 对象)
                 │
                 ▼
           MessageItem 组件
                 │
                 ▼
           TimelineView 组件
       ┌──────┼──────┐
  ThinkingItem  ToolCallItem  OutputItem
```

### 2.2 核心设计决策

**为什么状态放在 ChatInterface 而非 MessageItem？**

原始计划曾设想在 `MessageItem` 中维护 `realtimeTimeline` 状态，但实际实现选择了在 `ChatInterface` 中集中管理：
- `MessageItem` 生命周期不稳定（可能随消息列表刷新而卸载/重建）
- 集中管理避免跨组件状态同步问题
- `timelineForRequestRef`（`Map<string, TimelineItem[]>`）以 `requestId` 为键，天然支持并发请求

---

## 3. 后端事件

所有流式事件在 `src-tauri/src/claurst/mod.rs` 中通过 Tauri `event_window.emit` 发出：

### 3.1 thinking-chunk

当 AI 执行思考过程时持续发出：

```json
{
  "request_id": "req_xxx",
  "item_id": "item_thinking_xxx",
  "chunk": "思考内容..."
}
```

### 3.2 tool-call-start

当 AI 开始调用工具时发出：

```json
{
  "request_id": "req_xxx",
  "item_id": "item_tool_xxx",
  "tool": "Read",
  "action": "读取文件...",
  "timestamp": 1712345678000,
  "tool_use_id": "toolu_xxx"
}
```

### 3.3 tool-call-end

当工具调用完成时发出：

```json
{
  "request_id": "req_xxx",
  "item_id": "item_tool_xxx",
  "tool": "Read",
  "success": true,
  "result": "文件内容...",
  "timestamp": 1712345679000,
  "tool_use_id": "toolu_xxx"
}
```

### 3.4 message-chunk

当 AI 输出文本内容时持续发出：

```json
{
  "request_id": "req_xxx",
  "item_id": "item_output_xxx",
  "chunk": "文本内容...",
  "timestamp": 1712345678000
}
```

---

## 4. 前端实现

### 4.1 核心文件

| 文件 | 职责 |
|------|------|
| `src/components/ChatInterface.tsx` | 事件监听、timeline 状态管理、streaming message 更新 |
| `src/components/MessageItem.tsx` | 根据 timeline 数据渲染 TimelineView |
| `src/components/TimelineView.tsx` | 时间线容器，按类型分发子组件 |
| `src/components/ToolCallItem.tsx` | 工具调用单项展示（状态、结果折叠） |
| `src/components/TimelineView.css` | 时间线样式 |

### 4.2 状态管理 (`ChatInterface.tsx`)

```typescript
// 核心数据结构：以 requestId 为键的 timeline Map
const timelineForRequestRef = useRef<Map<string, TimelineItem[]>>(new Map());

// 读取当前请求的 timeline
const getRequestTimeline = (requestId: string) =>
  timelineForRequestRef.current.get(requestId) || [];

// 设置当前请求的 timeline
const setRequestTimeline = (requestId: string, timeline: TimelineItem[]) => {
  timelineForRequestRef.current.set(requestId, timeline);
};
```

### 4.3 实时更新消息 (`updateStreamingAssistantMessage`)

每次事件触发时，该函数将 timeline 数据注入到流式消息中，使 `MessageItem` 可以实时渲染：

```typescript
const updateStreamingAssistantMessage = (
  requestId: string,
  timeline: TimelineItem[],
  fallbackContent = ''
) => {
  const derivedContent = buildMessageContentFromTimeline(timeline) || fallbackContent;

  onMessagesChangeRef.current((currentMessages: Message[]) => {
    const last = currentMessages[currentMessages.length - 1];
    if (last && last.role === 'assistant' && last.requestId === requestId) {
      // 更新现有 streaming message
      return [
        ...currentMessages.slice(0, -1),
        { ...last, content: derivedContent, timeline: [...timeline], isStreaming: true },
      ];
    }
    // 创建新的 streaming message
    return [
      ...currentMessages,
      {
        id: `${Date.now()}-${random}`,
        role: 'assistant',
        content: derivedContent,
        timestamp: Date.now(),
        isStreaming: true,
        requestId,
        timeline: [...timeline],
      },
    ];
  });
};
```

### 4.4 事件处理逻辑

#### thinking-chunk 处理

1. 获取当前 requestId 的 timeline
2. 查找是否已有同 `item_id` 的 thinking 项
3. 有则追加 chunk 到 `content`，无则创建新的 thinking 项
4. 更新 timeline 并注入到 streaming message

#### message-chunk 处理

1. 获取当前 requestId 的 timeline
2. 查找是否已有同 `item_id` 的 output 项
3. 有则追加 chunk 到 `content`，无则创建新的 output 项
4. 更新 timeline 并注入到 streaming message（同时传递 fallbackContent）

#### tool-call-start 处理

1. 获取当前 requestId 的 timeline
2. 创建新的 `tool_call` 类型项，`status: 'running'`
3. 记录 `tool_use_id`（用于后续匹配 `tool-call-end`）
4. 更新 timeline 并注入到 streaming message

#### tool-call-end 处理

1. 获取当前 requestId 的 timeline
2. 通过 `tool_use_id` 匹配对应的 `tool_call` 项
3. 更新该项的 `status`（`success`/`error`）、`result` 和 `item_id`
4. 更新 timeline 并注入到 streaming message

### 4.5 终端请求保护

所有事件监听器中均包含终端请求检查：

```typescript
if (terminalRequestIdsRef.current.has(payload.request_id)) {
  console.log('[ChatInterface] ignore terminal ...');
  return;
}
```

当用户取消请求时，对应 `requestId` 被标记为终端请求，后续到达的事件被丢弃，避免已终止的请求继续更新 UI。

### 4.6 消息完成 (`finalizeStreamingMessage`)

当 AI 响应完成时：

- 后端返回的完整 timeline 数据替换前端积累的 timeline
- 消息 `isStreaming` 变为 `false`
- 前端 `requestTimelines` 中对应 entry 被清除

---

## 5. TimelineView 组件

### 5.1 数据优先级

在 `MessageItem` 中：

```typescript
const displayTimeline = message.isStreaming ? realtimeTimeline : historicalTimeline;
```

- **流式期间**：使用通过事件实时构建的 timeline
- **消息完成后**：使用从数据库加载的历史 timeline

### 5.2 渲染分发

`TimelineView` 根据 `item.type` 分发到子组件：

| type | 组件 | 说明 |
|------|------|------|
| `thinking` | ThinkingItem | 可折叠展开的思考过程 |
| `tool_call` | ToolCallItem | 工具名称、状态、参数、结果 |
| `output` | OutputItem | AI 输出文本内容 |

### 5.3 ToolCallItem 状态展示

| status | 图标 | 说明 |
|--------|------|------|
| `running` | ⏳ | 加载动画，表示正在执行 |
| `success` | ✓ | 绿色成功标识 |
| `error` | ✗ | 红色失败标识 |

工具调用结果默认折叠，点击 "▶ 查看结果" 可展开查看详情。

---

## 6. 向后兼容

- 旧消息（无 `timeline` 字段）回退到 `content` 纯文本展示
- `normalizeTimeline` 函数标准化 timeline 格式，兼容不同来源的数据
- `toolUseId` 字段可选，确保兼容历史数据

---

## 7. 数据持久化

消息完成后，完整的 timeline 数据随消息一起保存到 SQLite 数据库 `timeline_items` 表（详见 [database-and-ui-refactor-tech-spec.md](./database-and-ui-refactor-tech-spec.md)），确保刷新页面后仍可查看完整的时间线。
