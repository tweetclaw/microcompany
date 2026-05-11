# 数据库与 UI 重构技术说明

**文档版本**: v1.0  
**创建日期**: 2026-05-08  
**归档日期**: 2026-05-11  
**状态**: ✅ 已完成  

## 1. 概述

本文档描述 MicroCompany 应用的数据库存储和 UI 展示重构的技术实现详情。主要目标：
- 统一所有 AI 会话的数据存储到 SQLite 数据库
- 按时间线展示 AI 工作流程的完整细节（thinking / tool_call / output）
- 优化 UI 展示，模仿 Claude Code VS Code 插件的交互体验
- 统一应用配置和数据文件的存储位置

## 2. 数据存储架构

### 2.1 数据库位置

数据库文件路径：`~/.microcompany/data.db`

**目录结构**：
```
~/.microcompany/
├── data.db                 # SQLite 数据库
├── config.json             # 应用配置
├── archetypes/             # 系统原型定义
│   ├── backend_developer.md
│   ├── frontend_developer.md
│   └── ...
└── conversations/          # 会话数据存储（旧版文件存储，向后兼容）
    ├── {session-id-1}.json
    ├── {session-id-2}.json
    └── ...
```

**实现文件**: `src-tauri/src/lib.rs`（第28行）

```rust
let db_path = home_dir.join(".microcompany").join("data.db");
```

### 2.2 数据库表结构

#### sessions 表

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,           -- 'chat' 或 'task'
    task_id TEXT,                 -- 关联的 task ID
    role_id TEXT,                 -- 关联的 role ID
    provider TEXT,
    model TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

#### messages 表

```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,           -- 'user' 或 'assistant'
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    request_id TEXT,              -- AI 请求 ID
    is_streaming INTEGER DEFAULT 0,
    timeline_data TEXT,           -- JSON: 时间线数据（历史消息用）
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

#### timeline_items 表（新增 Migration 008）

```sql
CREATE TABLE timeline_items (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('thinking', 'tool_call', 'output')),
    timestamp INTEGER NOT NULL,   -- Unix timestamp in milliseconds
    content TEXT,
    tool TEXT,
    action TEXT,
    status TEXT CHECK(status IN ('running', 'success', 'error')),
    result TEXT,
    tool_use_id TEXT,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX idx_timeline_items_message_id ON timeline_items(message_id);
CREATE INDEX idx_timeline_items_timestamp ON timeline_items(timestamp);
CREATE INDEX idx_timeline_items_message_timestamp ON timeline_items(message_id, timestamp);
```

**迁移文件**: `src-tauri/migrations/008_add_timeline_items.sql`

### 2.3 后端时间线数据收集

**核心文件**: `src-tauri/src/claurst/mod.rs`

在 AI 流式输出过程中实时收集三种类型的时间线数据：

| 类型 | 触发时机 | 说明 |
|------|----------|------|
| `thinking` | AI 推理阶段 | 收集 AI 的思考过程 |
| `tool_call` | 工具调用 | 记录工具名称、动作、参数、执行状态和结果 |
| `output` | AI 文本输出 | 流式收集 AI 的回复内容 |

**关键数据结构**（`src-tauri/src/api/message.rs`）:

```rust
pub struct TimelineItem {
    pub id: String,
    pub message_id: String,
    pub item_type: String,   // "thinking", "tool_call", "output"
    pub timestamp: i64,
    pub content: Option<String>,
    pub tool: Option<String>,
    pub action: Option<String>,
    pub status: Option<String>,
    pub result: Option<String>,
    pub tool_use_id: Option<String>,
}
```

**文件存储数据结构**（`src-tauri/src/storage/mod.rs`）:

```rust
pub struct StoredTimelineItem {
    pub id: String,
    pub item_type: String,
    pub timestamp: i64,
    pub content: Option<String>,
    pub tool: Option<String>,
    pub action: Option<String>,
    pub status: Option<String>,
    pub result: Option<String>,
    pub tool_use_id: Option<String>,
}
```

## 3. 前端 UI 架构

### 3.1 实时流式展示

前端通过监听后端事件实现实时时间线展示：

| 事件 | 处理器位置 | 行为 |
|------|-----------|------|
| `message-chunk` | `ChatInterface.tsx` L656 | 实时追加 AI 输出内容到 output 类型 timeline item |
| `thinking-chunk` | `ChatInterface.tsx` L692 | 实时追加思考内容到 thinking 类型 timeline item |
| `tool-call-start` | `ChatInterface.tsx` L727 | 创建 tool_call 类型 timeline item，状态为 running |
| `tool-call-end` | `ChatInterface.tsx` L771 | 更新 tool_call 类型 timeline item 的状态和结果 |
| `request-completed` | `ChatInterface.tsx` L917 | 使用后端返回的完整 timeline 数据覆盖前端缓存 |

**关键 ref**：
- `timelineForRequestRef`: `Map<requestId, TimelineItem[]>` — 按请求 ID 缓存实时 timeline
- `processTimelineRef`: 用于检测工具调用是否产生可见文本

### 3.2 组件结构

```
MessageItem.tsx
├── 用户消息: 直接显示 content
└── AI 消息:
    ├── 有 timeline 数据 → TimelineView 组件
    │   ├── ThinkingItem (内联): 💭 思考内容，支持折叠
    │   ├── ToolCallItem (内联): 🔧 工具调用，显示状态和结果
    │   └── OutputItem (内联): 💬 AI 输出，Markdown 渲染
    └── 无 timeline 数据 → 传统 content 显示（向后兼容）
```

**组件文件**:
| 文件 | 作用 |
|------|------|
| `src/components/TimelineView.tsx` | 时间线容器组件，遍历 timeline 数组渲染各类型条目 |
| `src/components/TimelineView.css` | 时间线样式 |
| `src/components/ToolCallItem.tsx` | 工具调用条目组件（也用于向后兼容旧的 toolCalls 展示） |
| `src/components/MessageItem.tsx` | 消息容器，集成 TimelineView |

### 3.3 TypeScript 类型定义（`src/types/index.ts`）

```typescript
interface TimelineItem {
  id: string;
  messageId: string;
  type: 'thinking' | 'tool_call' | 'output';
  timestamp: number;
  content?: string;
  tool?: string;
  action?: string;
  status?: 'running' | 'success' | 'error';
  result?: string;
  toolUseId?: string;
}

interface Message {
  // ... 其他字段
  timeline?: TimelineItem[];
  toolCalls?: ToolCall[];  // 向后兼容
}
```

### 3.4 视觉设计

| 类型 | 图标 | 默认状态 | 特殊样式 |
|------|------|----------|----------|
| thinking | 💭 | 折叠 | 斜体、灰色文字、虚线边框 |
| tool_call (running) | 🔧⏳ | 展开 | 浅蓝背景、旋转动画 |
| tool_call (success) | 🔧✓ | 折叠结果 | 浅绿背景 |
| tool_call (error) | 🔧✗ | 折叠结果 | 浅红背景 |
| output | 💬 | 完整展开 | 支持 Markdown、代码高亮 |

## 4. 数据流

```
┌─────────────────────────────────────────────────────┐
│ 后端 (Rust)                                          │
│                                                      │
│  claurst/mod.rs                                       │
│  ├── thinking 事件 → emit thinking-chunk             │
│  ├── tool_use 事件 → emit tool-call-start             │
│  ├── tool_result → emit tool-call-end                 │
│  ├── text_chunk → emit message-chunk                  │
│  └── 请求结束 → emit request-completed (含完整timeline)│
│                                                      │
│  api/message.rs                                       │
│  ├── save_message: 保存 timeline 到 timeline_items 表 │
│  └── get_messages: 加载 timeline 从 timeline_items 表 │
└──────────────────────┬──────────────────────────────┘
                       │ Tauri Events
                       ▼
┌─────────────────────────────────────────────────────┐
│ 前端 (TypeScript/React)                              │
│                                                      │
│  ChatInterface.tsx                                    │
│  ├── 监听实时事件，更新 timelineForRequestRef         │
│  ├── updateStreamingAssistantMessage()               │
│  └── finalizeStreamingMessage(timeline)              │
│                                                      │
│  MessageItem.tsx                                      │
│  └── message.timeline → TimelineView                  │
│                                                      │
│  TimelineView.tsx                                     │
│  ├── type=thinking → ThinkingItem (内联折叠)         │
│  ├── type=tool_call → ToolCallItem                    │
│  └── type=output → OutputItem (内联Markdown)          │
└─────────────────────────────────────────────────────┘
```

## 5. 技术决策

| 决策 | 说明 |
|------|------|
| 数据库位置统一到 `~/.microcompany/` | 用户主目录下的统一位置，便于备份和迁移 |
| timeline 实时展示优先于数据库查询 | 前端优先使用事件驱动的实时 timeline，数据库仅用于历史恢复 |
| 保留 `toolCalls` 字段向后兼容 | 旧消息无 timeline 时回退到 toolCalls 和 content 展示 |
| 按请求 ID 隔离 timeline | 每个 AI 请求有独立的 timeline 缓存，防止多请求交叉污染 |
| 使用 ref 而非 state 管理实时 timeline | 避免高频事件触发不必要的重新渲染 |

## 6. 相关文件清单

### 后端文件
- `src-tauri/src/lib.rs` — 数据库初始化，路径配置
- `src-tauri/src/database/mod.rs` — 数据库操作
- `src-tauri/src/database/migration.rs` — 数据库迁移（008: timeline_items）
- `src-tauri/src/claurst/mod.rs` — AI 流式输出 + timeline 事件发送
- `src-tauri/src/api/message.rs` — 消息 API（TimelineItem 结构体）
- `src-tauri/src/api/message_impl.rs` — 消息保存/加载实现
- `src-tauri/src/storage/mod.rs` — 文件存储（StoredTimelineItem）
- `src-tauri/migrations/008_add_timeline_items.sql` — 迁移 SQL

### 前端文件
- `src/types/index.ts` — TimelineItem 接口定义
- `src/components/ChatInterface.tsx` — 实时事件监听和 timeline 状态管理
- `src/components/MessageItem.tsx` — 消息组件，集成 TimelineView
- `src/components/TimelineView.tsx` — 时间线容器组件
- `src/components/TimelineView.css` — 时间线样式
- `src/components/ToolCallItem.tsx` — 工具调用条目组件
