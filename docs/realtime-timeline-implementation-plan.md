# 实时 Timeline 展示实现计划

**创建日期**: 2026-05-08  
**优先级**: 🔴 **最高 - 核心功能**  
**预计时间**: 4-6 小时

---

## 1. 问题分析

### 1.1 当前实现的问题 ❌

1. **只展示历史数据**: 只在消息完成后从数据库读取 timeline 数据
2. **分区域展示**: AI 回答在顶部，工具调用在底部，不是按时间顺序穿插
3. **缺少实时反馈**: 工具调用没有实时显示，只有在任务完成后才展示
4. **缺少细节**: 工具调用只显示简单状态，没有参数和结果详情

### 1.2 用户真实需求 ✅

用户关注的是 **AI 的实时工作过程**，而不是历史记录：
- 看到 AI 正在思考
- 看到 AI 调用了什么工具
- 看到工具的执行结果
- 所有内容按时间顺序实时展示

---

## 2. 技术方案

### 2.1 核心思路

**实时流式展示 = 监听事件 + 动态渲染**

```
后端事件流 → 前端监听 → 动态插入 Timeline 项 → 实时渲染
```

### 2.2 前端状态管理

在 `MessageItem` 组件中维护两个 timeline：

```typescript
// 实时 timeline（流式输出过程中）
const [realtimeTimeline, setRealtimeTimeline] = useState<TimelineItem[]>([]);

// 历史 timeline（从数据库加载）
const historicalTimeline = message.timeline || [];

// 优先使用实时 timeline，消息完成后使用历史 timeline
const displayTimeline = message.isStreaming ? realtimeTimeline : historicalTimeline;
```

### 2.3 事件监听

需要监听的事件：

1. **`tool-call-start`** - 工具调用开始
   - 立即插入工具调用项
   - 状态: `running`
   - 显示加载动画

2. **`tool-call-end`** - 工具调用结束
   - 更新对应的工具调用项
   - 状态: `success` 或 `error`
   - 显示结果内容

3. **`message-chunk`** - 消息流式输出
   - 实时追加文本内容
   - 可能需要创建或更新 output 项

4. **thinking 相关事件**（如果后端有发送）
   - 显示 AI 思考过程

---

## 3. 实施步骤

### 步骤 1: 分析现有事件系统 (30 分钟)

**任务**:
- [ ] 查看后端发送了哪些事件
- [ ] 确认事件的数据结构
- [ ] 确认前端是否已经监听这些事件
- [ ] 找到当前工具调用的展示位置

**文件**:
- `src-tauri/src/claurst/mod.rs` - 后端事件发送
- `src/components/MessageItem.tsx` - 前端消息组件
- `src/components/ToolCallItem.tsx` - 当前工具调用展示

---

### 步骤 2: 重构 MessageItem 状态管理 (1 小时)

**任务**:
- [ ] 添加 `realtimeTimeline` 状态
- [ ] 实现动态插入 timeline 项的函数
- [ ] 实现按时间戳排序的逻辑
- [ ] 区分实时和历史 timeline

**实现代码**:

```typescript
// src/components/MessageItem.tsx

const [realtimeTimeline, setRealtimeTimeline] = useState<TimelineItem[]>([]);

// 插入新的 timeline 项（按时间戳排序）
const insertTimelineItem = (item: TimelineItem) => {
  setRealtimeTimeline(prev => {
    const newTimeline = [...prev, item];
    // 按时间戳排序
    newTimeline.sort((a, b) => a.timestamp - b.timestamp);
    return newTimeline;
  });
};

// 更新已存在的 timeline 项
const updateTimelineItem = (id: string, updates: Partial<TimelineItem>) => {
  setRealtimeTimeline(prev => 
    prev.map(item => item.id === id ? { ...item, ...updates } : item)
  );
};

// 优先使用实时 timeline
const displayTimeline = message.isStreaming ? realtimeTimeline : (message.timeline || []);
```

---

### 步骤 3: 实现事件监听 (1.5 小时)

**任务**:
- [ ] 监听 `tool-call-start` 事件
- [ ] 监听 `tool-call-end` 事件
- [ ] 监听 `message-chunk` 事件
- [ ] 处理事件数据并更新 timeline

**实现代码**:

```typescript
// src/components/MessageItem.tsx

useEffect(() => {
  if (!message.isStreaming || !message.requestId) return;

  // 监听工具调用开始
  const unlistenToolStart = window.listen('tool-call-start', (event: any) => {
    if (event.payload.request_id !== message.requestId) return;
    
    const toolItem: TimelineItem = {
      id: `tool-${Date.now()}`,
      messageId: message.id,
      type: 'tool_call',
      timestamp: Date.now(),
      tool: event.payload.tool,
      action: event.payload.action,
      status: 'running',
    };
    
    insertTimelineItem(toolItem);
  });

  // 监听工具调用结束
  const unlistenToolEnd = window.listen('tool-call-end', (event: any) => {
    if (event.payload.request_id !== message.requestId) return;
    
    // 找到对应的 tool item 并更新
    setRealtimeTimeline(prev => 
      prev.map(item => {
        if (item.type === 'tool_call' && 
            item.tool === event.payload.tool && 
            item.status === 'running') {
          return {
            ...item,
            status: event.payload.success ? 'success' : 'error',
            result: event.payload.result,
          };
        }
        return item;
      })
    );
  });

  // 监听消息流式输出
  const unlistenChunk = window.listen('message-chunk', (event: any) => {
    if (event.payload.request_id !== message.requestId) return;
    
    // 更新或创建 output 项
    setRealtimeTimeline(prev => {
      const lastItem = prev[prev.length - 1];
      
      if (lastItem && lastItem.type === 'output') {
        // 追加到现有 output
        return prev.map((item, idx) => 
          idx === prev.length - 1 
            ? { ...item, content: (item.content || '') + event.payload.chunk }
            : item
        );
      } else {
        // 创建新的 output 项
        return [...prev, {
          id: `output-${Date.now()}`,
          messageId: message.id,
          type: 'output',
          timestamp: Date.now(),
          content: event.payload.chunk,
        }];
      }
    });
  });

  return () => {
    unlistenToolStart.then(fn => fn());
    unlistenToolEnd.then(fn => fn());
    unlistenChunk.then(fn => fn());
  };
}, [message.isStreaming, message.requestId, message.id]);
```

---

### 步骤 4: 修改 TimelineView 组件 (1 小时)

**任务**:
- [ ] 接受实时 timeline 数据
- [ ] 支持动态更新
- [ ] 按时间顺序渲染所有项
- [ ] 移除旧的分区域展示逻辑

**实现代码**:

```typescript
// src/components/TimelineView.tsx

interface TimelineViewProps {
  timeline: TimelineItem[];
  isStreaming?: boolean;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ timeline, isStreaming }) => {
  if (!timeline || timeline.length === 0) {
    return null;
  }

  return (
    <div className="timeline-view">
      {timeline.map((item) => {
        if (item.type === 'thinking') {
          return <ThinkingItem key={item.id} item={item} />;
        }
        
        if (item.type === 'tool_call') {
          return <ToolCallItem key={item.id} item={item} isStreaming={isStreaming} />;
        }
        
        if (item.type === 'output') {
          return <OutputItem key={item.id} item={item} />;
        }
        
        return null;
      })}
    </div>
  );
};
```

---

### 步骤 5: 优化 ToolCallItem 组件 (1 小时)

**任务**:
- [ ] 显示工具名称、参数、状态
- [ ] 运行中显示加载动画
- [ ] 完成后显示结果
- [ ] 支持折叠/展开结果

**实现代码**:

```typescript
// src/components/ToolCallItem.tsx

const ToolCallItem: React.FC<{ item: TimelineItem; isStreaming?: boolean }> = ({ item, isStreaming }) => {
  const [isResultExpanded, setIsResultExpanded] = useState(false);

  return (
    <div className="timeline-item timeline-tool">
      <div className="timeline-marker tool-marker">🔧</div>
      <div className="timeline-content">
        <div className="tool-header">
          <span className="tool-name">{item.tool}</span>
          <span className={`tool-status status-${item.status}`}>
            {item.status === 'running' && '⏳ 执行中'}
            {item.status === 'success' && '✓ 成功'}
            {item.status === 'error' && '✗ 失败'}
          </span>
        </div>
        
        {item.action && (
          <div className="tool-action">{item.action}</div>
        )}
        
        {item.result && item.status !== 'running' && (
          <div className="tool-result">
            <div
              className="tool-result-toggle"
              onClick={() => setIsResultExpanded(!isResultExpanded)}
            >
              {isResultExpanded ? '▼' : '▶'} 查看结果
            </div>
            {isResultExpanded && (
              <pre className="tool-result-content">{item.result}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
```

---

### 步骤 6: 移除旧的工具调用展示 (30 分钟)

**任务**:
- [ ] 找到底部的工具调用展示区域
- [ ] 移除或隐藏该区域
- [ ] 确保所有工具调用都在 timeline 中展示

**文件**:
- `src/components/MessageItem.tsx`
- 可能的其他工具调用展示组件

---

### 步骤 7: 测试和调试 (1 小时)

**任务**:
- [ ] 测试工具调用的实时展示
- [ ] 测试时间顺序是否正确
- [ ] 测试折叠/展开功能
- [ ] 测试边界情况（多个工具调用、快速连续调用）
- [ ] 测试消息完成后的历史展示

---

## 4. 验收标准

### 4.1 实时性验证

- [ ] AI 开始思考时，立即显示 thinking 项
- [ ] 工具调用开始时，立即显示工具调用项（状态: running）
- [ ] 工具调用结束时，立即更新状态和结果
- [ ] 所有内容按时间顺序实时展示

### 4.2 展示完整性验证

- [ ] 工具调用显示工具名称
- [ ] 工具调用显示动作描述
- [ ] 工具调用显示执行状态
- [ ] 工具调用显示执行结果
- [ ] 支持折叠/展开结果详情

### 4.3 时间顺序验证

- [ ] thinking、tool_call、output 按时间顺序穿插展示
- [ ] 不是分区域展示（AI 回答在顶部，工具在底部）
- [ ] 多个工具调用按实际执行顺序展示

### 4.4 用户体验验证

- [ ] 工具调用运行中显示加载动画
- [ ] 工具调用完成后显示成功/失败状态
- [ ] 折叠/展开动画平滑
- [ ] 长结果内容支持滚动

---

## 5. 风险和注意事项

### 5.1 事件数据结构

**风险**: 后端事件的数据结构可能与预期不同

**缓解**: 先分析后端代码，确认事件结构后再实现

### 5.2 事件时序

**风险**: 事件可能乱序到达

**缓解**: 使用时间戳排序，确保展示顺序正确

### 5.3 性能

**风险**: 频繁更新状态可能影响性能

**缓解**: 
- 使用 React.memo 优化组件渲染
- 避免不必要的重新渲染

### 5.4 状态同步

**风险**: 实时 timeline 和历史 timeline 可能不一致

**缓解**: 
- 消息完成后，清空实时 timeline
- 依赖数据库的历史 timeline

---

## 6. 后续优化

完成基本功能后，可以考虑：

1. **Thinking 内容展示**: 如果后端发送 thinking 事件，实时展示
2. **更丰富的动画**: 工具调用的进入/退出动画
3. **性能优化**: 虚拟滚动、懒加载
4. **更好的错误处理**: 工具调用失败时的详细错误信息

---

## 7. 开始实施

**第一步**: 分析现有事件系统，确认后端发送了哪些事件

准备好开始了吗？
