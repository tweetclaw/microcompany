# 架构改进方案:将 AI 过程信息作为消息显示在对话区

## 背景

### 当前问题
用户反馈:在执行长任务时,中间对话区显示的不是干净的最终答案,而是过程性文本(如"让我继续分析…"、"正在执行工具…")。

### 当前架构
- **右侧 Inspector 面板**:显示过程时间线(ProcessTimeline),包含工具调用、状态变化等
- **中间对话区**:显示用户消息和 AI 的最终回答
- **问题**:最终回答区域混入了过程性文本,而不是纯粹的答案

## 用户期望的行为

类似于 Cursor、Windsurf、GitHub Copilot 等 IDE 中的 AI 助手:

1. **过程信息作为特殊消息**:每个 AI 动作(工具调用、思考、生成)作为一条特殊样式的消息插入到对话区
2. **实时流式更新**:用户可以看到 AI 正在做什么,而不是等待最终结果
3. **清晰的视觉层次**:
   - 用户消息:标准样式
   - AI 最终回答:标准样式
   - AI 过程消息:特殊样式(灰色背景、小字体、图标等)

### 参考示例(Cursor 风格)

```
[用户] 帮我分析一下这个项目的架构

[AI 过程] 🔍 正在读取 src/main.rs...
[AI 过程] 🔍 正在读取 Cargo.toml...
[AI 过程] 🤔 正在分析项目结构...
[AI 回答] 这是一个 Rust 项目,使用 Tauri 框架...
           [详细的分析内容]
```

## 可行性分析

### 1. 数据流分析

#### 当前数据流
```
后端(Rust) -> Tauri Event -> 前端(React)
  |
  ├─ ai-request-start
  ├─ ai-status (思考、工具执行、生成)
  ├─ tool-call-start
  ├─ tool-call-end
  ├─ message-chunk (流式文本)
  └─ ai-request-end (final_text)
```

#### 前端处理
- `message-chunk`:追加到最后一条 assistant 消息的 content
- `ai-status`、`tool-call-*`:添加到 `processTimeline` 数组,显示在右侧 Inspector
- `ai-request-end`:调用 `finalizeStreamingMessage` 替换最终内容

### 2. 架构改进方案

#### 方案 A:扩展消息类型(推荐)

**核心思路**:在 `Message` 类型中增加一个 `messageType` 字段,区分不同类型的消息。

##### 类型定义修改

```typescript
// src/types/index.ts
export type MessageType = 
  | 'user'           // 用户消息
  | 'assistant'      // AI 最终回答
  | 'process';       // AI 过程消息(工具调用、状态等)

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  messageType: MessageType;  // 新增
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  requestId?: string;
  
  // 过程消息的额外字段
  processInfo?: {
    phase?: AiStatusPhase;
    tool?: string;
    success?: boolean;
  };
}
```

##### 前端修改

1. **事件监听器修改** ([ChatInterface.tsx:191-359](src/components/ChatInterface.tsx#L191-L359))

```typescript
// 当前:ai-status 事件只更新 processTimeline
unlistenStatus = await listen<AiStatusEvent>('ai-status', (event) => {
  // 当前代码...
  appendTimeline({ ... });
});

// 改进:同时插入一条过程消息到对话区
unlistenStatus = await listen<AiStatusEvent>('ai-status', (event) => {
  const payload = event.payload;
  if (payload.request_id !== activeRequestIdRef.current) return;
  
  // 插入过程消息
  onMessagesChangeRef.current((prev: Message[]) => [
    ...prev,
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'assistant',
      messageType: 'process',
      content: payload.text,
      timestamp: Date.now(),
      requestId: payload.request_id,
      processInfo: { phase: payload.phase },
    },
  ]);
  
  // 保留原有的 timeline 更新(可选,或者移除)
  appendTimeline({ ... });
});
```

2. **工具调用事件修改**

```typescript
unlistenToolStart = await listen<AiToolStartEvent>('tool-call-start', (event) => {
  const payload = event.payload;
  if (payload.request_id !== activeRequestIdRef.current) return;
  
  // 插入工具开始消息
  onMessagesChangeRef.current((prev: Message[]) => [
    ...prev,
    {
      id: `tool-start-${Date.now()}`,
      role: 'assistant',
      messageType: 'process',
      content: `🔧 ${payload.action}`,
      timestamp: Date.now(),
      requestId: payload.request_id,
      processInfo: { tool: payload.tool },
    },
  ]);
});

unlistenToolEnd = await listen<AiToolEndEvent>('tool-call-end', (event) => {
  const payload = event.payload;
  if (payload.request_id !== activeRequestIdRef.current) return;
  
  // 插入工具结束消息
  onMessagesChangeRef.current((prev: Message[]) => [
    ...prev,
    {
      id: `tool-end-${Date.now()}`,
      role: 'assistant',
      messageType: 'process',
      content: payload.success 
        ? `✅ ${payload.tool} 执行成功`
        : `❌ ${payload.tool} 执行失败`,
      timestamp: Date.now(),
      requestId: payload.request_id,
      processInfo: { 
        tool: payload.tool, 
        success: payload.success 
      },
    },
  ]);
});
```

3. **消息渲染修改** ([MessageList.tsx](src/components/MessageList.tsx))

```typescript
// 当前:所有消息使用相同样式
// 改进:根据 messageType 应用不同样式

const MessageItem = ({ message }: { message: Message }) => {
  if (message.messageType === 'process') {
    return (
      <div className="message-process">
        <div className="process-icon">
          {getProcessIcon(message.processInfo?.phase)}
        </div>
        <div className="process-content">{message.content}</div>
      </div>
    );
  }
  
  // 原有的用户/助手消息渲染
  return (
    <div className={`message message-${message.role}`}>
      {/* 原有渲染逻辑 */}
    </div>
  );
};
```

4. **CSS 样式** (新增)

```css
/* 过程消息样式 */
.message-process {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  margin: 4px 0;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 6px;
  font-size: 13px;
  color: #666;
}

.process-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.process-content {
  flex: 1;
  font-family: 'SF Mono', 'Monaco', monospace;
}

/* 暗色模式 */
.dark .message-process {
  background: rgba(255, 255, 255, 0.05);
  color: #999;
}
```

##### 后端修改(可选)

后端不需要大改,因为前端已经可以从现有事件中提取信息。但如果想优化,可以:

1. 新增一个 `ai-process-message` 事件,专门用于发送过程消息
2. 在 `QueryEvent` 处理中,直接发送格式化好的过程消息

#### 方案 B:保持当前架构,只修复 final_text 问题

如果不想做大的架构改动,只需要:

1. 确保后端正确提取 `final_text`(已添加调试日志)
2. 确保前端正确替换消息内容(已添加调试日志)
3. 修复任何发现的 bug

**优点**:改动小,风险低
**缺点**:不解决用户体验问题(无法实时看到 AI 在做什么)

### 3. 推荐方案

**短期(本次修复)**:
- 使用方案 B,先修复当前的 `final_text` 显示问题
- 通过调试日志定位根本原因

**长期(下一个迭代)**:
- 实施方案 A,将过程信息作为消息显示
- 可以考虑保留右侧 Inspector 作为"详细视图",或者完全移除

## 实施步骤

### 短期修复(当前)

1. ✅ 添加调试日志(已完成)
2. ⏳ 运行测试,查看日志输出
3. ⏳ 根据日志定位问题
4. ⏳ 修复 bug
5. ⏳ 验证修复

### 长期改进(未来)

#### Phase 1:基础实施(1-2 天)
1. 修改类型定义,增加 `messageType` 字段
2. 修改事件监听器,插入过程消息
3. 修改消息渲染组件,支持过程消息样式
4. 添加基础 CSS 样式

#### Phase 2:优化体验(1 天)
1. 优化过程消息的图标和文案
2. 添加动画效果(如工具执行时的 loading 动画)
3. 支持折叠/展开过程消息
4. 添加"只看最终回答"的过滤选项

#### Phase 3:清理(0.5 天)
1. 决定是否保留右侧 Inspector 面板
2. 如果保留,调整其功能定位(如只显示元信息、成本统计等)
3. 如果移除,清理相关代码

## 风险评估

### 方案 A 的风险

1. **消息数量激增**:每个工具调用、状态变化都会产生一条消息
   - **缓解**:实施消息合并策略(如连续的相同类型消息合并)
   - **缓解**:添加"简洁模式",只显示关键过程消息

2. **性能问题**:频繁更新消息列表可能导致渲染性能下降
   - **缓解**:使用 React 虚拟列表(如 `react-window`)
   - **缓解**:优化消息更新逻辑,减少不必要的重渲染

3. **存储问题**:过程消息是否需要持久化?
   - **建议**:不持久化过程消息,只保存用户消息和 AI 最终回答
   - **实现**:在保存到数据库时,过滤掉 `messageType === 'process'` 的消息

4. **用户习惯**:用户可能不习惯新的界面
   - **缓解**:提供设置选项,允许切换回旧模式
   - **缓解**:添加引导提示,说明新功能

## 总结

- **短期**:修复 `final_text` 显示问题,确保中间对话区显示正确的最终答案
- **长期**:实施方案 A,将 AI 过程信息作为特殊消息显示在对话区,提升用户体验
- **关键决策点**:是否保留右侧 Inspector 面板(建议保留,但调整功能定位)

## 下一步行动

1. 等待调试日志输出,定位当前 bug
2. 修复 bug 后,与用户讨论是否实施长期改进方案
3. 如果实施,先做一个简单的 POC(Proof of Concept)验证可行性
