# 数据库与 UI 重构需求文档

**文档版本**: v1.0  
**创建日期**: 2026-05-08  
**状态**: 待实施

## 1. 概述

本文档描述了 MicroCompany 应用的底层数据存储和 UI 展示的重构需求。主要目标是：
- 统一所有 AI 会话的数据存储到数据库
- 按时间线展示 AI 工作流程的完整细节
- 优化 UI 展示，模仿 Claude Code VS Code 插件的交互体验
- 统一应用配置和数据文件的存储位置

## 2. 数据存储重构

### 2.1 数据库位置

**需求**: 将数据库文件从当前位置迁移到用户主目录下的统一位置

**当前数据库位置**: 
- macOS: `~/Library/Application Support/com.microcompany.app/.mc/data.db`
- 其他平台: `{app_data_dir}/.mc/data.db`

**目标位置**: `~/.microcompany/data.db`

**实现细节**:
- 数据库文件路径: `~/.microcompany/data.db`
- 应用配置文件: `~/.microcompany/config.json` (已存在)
- 系统原型定义: `~/.microcompany/archetypes/` (已存在)
- 会话数据存储: `~/.microcompany/conversations/` (已存在)

**目录结构**:
```
~/.microcompany/
├── data.db                 # SQLite 数据库 (需要迁移)
├── config.json             # 应用配置 (已存在)
├── archetypes/             # 系统原型定义 (已存在)
│   ├── backend_developer.md
│   ├── frontend_developer.md
│   └── ...
└── conversations/          # 会话数据存储 (已存在)
    ├── {session-id-1}.json
    ├── {session-id-2}.json
    └── ...
```

**需要修改的代码文件**:
1. `src-tauri/src/lib.rs` - 数据库初始化路径 (第 30 行)
2. `src-tauri/src/api/backup_impl.rs` - 备份相关的数据库路径

### 2.2 统一会话数据存储

**需求**: Task AI session 和普通 Chat AI session 的对话数据都存储到数据库中

**当前问题**:
- Task AI session 的数据可能没有完整存储到数据库
- 普通 Chat session 和 Task session 的存储逻辑不一致

**实现细节**:

#### 2.2.1 数据库表结构

**sessions 表** (已存在，需确认字段完整性):
```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,           -- 'chat' 或 'task'
    task_id TEXT,                 -- 关联的 task ID (仅 task 类型)
    role_id TEXT,                 -- 关联的 role ID (仅 task 类型)
    provider TEXT,
    model TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

**messages 表** (已存在，需扩展):
```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,           -- 'user' 或 'assistant'
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    request_id TEXT,              -- AI 请求 ID
    is_streaming INTEGER DEFAULT 0,
    timeline_data TEXT,           -- JSON: 时间线数据
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

**timeline_items 表** (新增):
```sql
CREATE TABLE timeline_items (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    type TEXT NOT NULL,           -- 'thinking', 'tool_call', 'output'
    timestamp INTEGER NOT NULL,
    content TEXT,                 -- 思考内容或输出内容
    tool TEXT,                    -- 工具名称 (仅 tool_call 类型)
    action TEXT,                  -- 工具动作描述 (仅 tool_call 类型)
    status TEXT,                  -- 'running', 'success', 'error' (仅 tool_call 类型)
    result TEXT,                  -- 工具执行结果 (仅 tool_call 类型)
    FOREIGN KEY (message_id) REFERENCES messages(id)
);
```

#### 2.2.2 数据保存逻辑

**后端 (Rust)**:
1. 在 `src-tauri/src/claurst/mod.rs` 中，确保所有 AI 会话（无论是 chat 还是 task）都保存到数据库
2. 在流式输出时，实时收集时间线数据：
   - AI 思考阶段 (thinking)
   - 工具调用 (tool_call)
   - AI 输出 (output)
3. 在请求结束时，将完整的时间线数据保存到 `timeline_items` 表

**前端 (TypeScript)**:
1. 从数据库加载消息时，同时加载关联的时间线数据
2. 在 UI 中按时间顺序展示时间线项

### 2.3 数据迁移策略

**需求**: 不迁移旧数据，一切从头开始

**实现细节**:
1. 在应用启动时，检查 `~/.microcompany/` 目录是否存在
2. 如果不存在，创建目录结构并初始化新数据库
3. 如果存在旧数据库文件，提示用户是否删除（可选）
4. 更新所有数据库连接代码，指向新位置

## 3. UI 展示重构

### 3.1 时间线展示

**核心需求（刚需）**: ⚠️ **实时流式展示，而不是历史数据展示**

**关键要求**:
1. **实时性**: 在 AI 流式输出过程中，就要实时展示 thinking、tool_call、output
2. **时间顺序**: 所有内容按照实际发生的时间顺序穿插展示，不是分区域展示
3. **即时反馈**: 
   - AI 开始思考 → 立即显示 "💭 AI 正在思考..."
   - 调用工具 → 立即显示 "🔧 正在执行 Bash..."
   - 工具返回结果 → 立即显示结果内容
   - AI 继续思考 → 再次显示思考内容
   - 最终输出 → 显示回答文本
4. **不是历史记录**: 用户关注的是**实时过程**，不是消息完成后从数据库读取的历史数据

**错误的实现方式** ❌:
- ❌ 只在消息完成后从数据库读取 timeline 数据
- ❌ AI 回答在顶部，工具调用在底部（分区域展示）
- ❌ 只有在任务完成、数据落库之后才展示细节
- ❌ 工具调用没有细节展示，只有简单的状态提示

**正确的实现方式** ✅:
- ✅ 监听实时事件（`tool-call-start`, `tool-call-end`, `message-chunk`）
- ✅ 在流式输出过程中动态插入 timeline 项
- ✅ 按时间顺序穿插展示所有内容
- ✅ 工具调用立即显示详细信息（工具名、参数、结果）

**设计原则**:
- 按时间顺序从上到下展示（实时追加）
- 不同类型的信息使用不同的视觉样式
- 信息层次清晰，重要信息突出
- 支持折叠/展开详细内容

#### 3.1.2 实时流式展示的技术实现

**前端实现要点**:

1. **监听实时事件**:
```typescript
// 监听 thinking 开始（如果有相关事件）
window.listen('thinking-start', (event) => {
  // 立即在 timeline 中插入 thinking 项
});

// 监听工具调用开始
window.listen('tool-call-start', (event) => {
  // 立即在 timeline 中插入工具调用项，状态为 running
});

// 监听工具调用结束
window.listen('tool-call-end', (event) => {
  // 更新对应的工具调用项，显示结果
});

// 监听消息流式输出
window.listen('message-chunk', (event) => {
  // 实时追加文本内容
});
```

2. **动态 Timeline 状态管理**:
```typescript
interface RealtimeTimelineItem {
  id: string;
  type: 'thinking' | 'tool_call' | 'output';
  timestamp: number;
  status: 'pending' | 'running' | 'completed';
  content?: string;
  tool?: string;
  action?: string;
  result?: string;
}

// 在消息组件中维护实时 timeline 状态
const [realtimeTimeline, setRealtimeTimeline] = useState<RealtimeTimelineItem[]>([]);
```

3. **时间顺序插入**:
   - 每个事件到达时，根据 timestamp 插入到正确的位置
   - 不是简单追加到末尾，而是按时间排序
   - 确保 thinking、tool_call、output 按实际发生顺序穿插展示

4. **数据库存储是次要的**:
   - 实时展示是主要功能
   - 数据库存储只是为了历史记录和页面刷新后恢复
   - 不应该依赖数据库来驱动实时 UI

**时间线布局示例（实时流式）**:

```
┌─────────────────────────────────────────────────────────┐
│ 👤 User                                                  │
│ 帮我实现一个登录功能                                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 🤖 Assistant                                             │
│                                                          │
│ 💭 AI 正在思考... (实时显示)                              │
│ ▶ 正在分析如何实现登录功能...                              │
│                                                          │
│ 🔧 Read src/components/Login.tsx ⏳ (实时显示)           │
│ 正在读取文件...                                           │
│                                                          │
│ 🔧 Read src/components/Login.tsx ✓ (更新状态)            │
│ ▶ 查看执行结果                                            │
│                                                          │
│ 💭 AI 正在思考... (实时显示)                              │
│ ▶ 分析现有代码结构...                                      │
│                                                          │
│ 🔧 Write src/components/Login.tsx ⏳ (实时显示)          │
│ 正在写入文件...                                           │
│                                                          │
│ 🔧 Write src/components/Login.tsx ✓ (更新状态)           │
│ ▶ 查看执行结果                                            │
│                                                          │
│ 💬 Output (实时流式输出)                                  │
│ 我已经实现了登录功能，主要包括：                             │
│ 1. 用户名和密码输入框                                      │
│ 2. 表单验证逻辑...                                        │
└─────────────────────────────────────────────────────────┘
```

#### 3.1.3 时间线项类型

**1. Thinking (AI 思考)**
- **显示内容**: AI 的思考过程和推理
- **默认状态**: 自动折叠
- **展开方式**: 点击展开查看详情
- **视觉样式**:
  - 图标: 💭 或 🤔
  - 背景色: 浅灰色 (#f5f5f5)
  - 边框: 虚线边框
  - 字体: 斜体，较小字号

**2. Tool Call (工具调用)**
- **显示内容**: 
  - 工具名称 (Read, Write, Bash, etc.)
  - 工具动作描述 (例如: "Read src/App.tsx")
  - 执行状态 (运行中、成功、失败)
  - 执行结果 (折叠显示)
- **默认状态**: 显示工具名称和动作，结果自动折叠
- **展开方式**: 点击查看执行结果详情
- **视觉样式**:
  - 图标: 🔧 或工具特定图标
  - 背景色: 
    - 运行中: 浅蓝色 (#e3f2fd)
    - 成功: 浅绿色 (#e8f5e9)
    - 失败: 浅红色 (#ffebee)
  - 状态指示器: 
    - 运行中: 旋转动画
    - 成功: ✓ 绿色对勾
    - 失败: ✗ 红色叉号

**3. Output (AI 输出)**
- **显示内容**: AI 的正常回复内容
- **默认状态**: 完全展开，显示全部内容
- **视觉样式**:
  - 图标: 💬 或 🤖
  - 背景色: 白色或透明
  - 支持 Markdown 渲染
  - 代码块语法高亮

#### 3.1.2 时间线布局

```
┌─────────────────────────────────────────────────────────┐
│ 👤 User                                                  │
│ 帮我实现一个登录功能                                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 🤖 Assistant                                             │
│                                                          │
│ 💭 Thinking (折叠)                                       │
│ ▶ AI 正在思考如何实现登录功能...                           │
│                                                          │
│ 🔧 Read src/components/Login.tsx ✓                      │
│ ▶ 查看执行结果                                            │
│                                                          │
│ 💭 Thinking (折叠)                                       │
│ ▶ 分析现有代码结构...                                      │
│                                                          │
│ 🔧 Write src/components/Login.tsx ✓                     │
│ ▶ 查看执行结果                                            │
│                                                          │
│ 💬 Output                                                │
│ 我已经实现了登录功能，主要包括：                             │
│ 1. 用户名和密码输入框                                      │
│ 2. 表单验证逻辑                                           │
│ 3. API 调用和错误处理                                     │
└─────────────────────────────────────────────────────────┘
```

### 3.2 模仿 Claude Code VS Code 插件

**需求**: AI 对话界面的样式和交互尽量模仿 Claude Code 的 VS Code 插件

#### 3.2.1 视觉设计参考

**1. 消息布局**:
- 用户消息: 左对齐，浅色背景
- AI 消息: 左对齐，白色背景
- 时间线项: 嵌套在 AI 消息内，缩进显示

**2. 动画效果**:
- 流式输出: 打字机效果，逐字显示
- 工具调用: 
  - 运行中: 旋转加载动画
  - 完成: 淡入动画
- 折叠/展开: 平滑的高度过渡动画

**3. 交互反馈**:
- 悬停效果: 鼠标悬停时显示边框或背景色变化
- 点击反馈: 点击时显示涟漪效果
- 加载状态: 显示骨架屏或加载指示器

#### 3.2.2 组件设计

**TimelineView 组件**:
```typescript
interface TimelineViewProps {
  timeline: TimelineItem[];
  isStreaming?: boolean;
}

interface TimelineItem {
  id: string;
  type: 'thinking' | 'tool_call' | 'output';
  timestamp: number;
  content?: string;
  tool?: string;
  action?: string;
  status?: 'running' | 'success' | 'error';
  result?: string;
}
```

**ThinkingItem 组件**:
- 默认折叠，显示摘要
- 点击展开显示完整内容
- 支持 Markdown 渲染

**ToolCallItem 组件**:
- 显示工具图标、名称、动作
- 状态指示器（运行中/成功/失败）
- 结果区域默认折叠
- 点击展开查看详细结果

**OutputItem 组件**:
- 完整显示 AI 回复内容
- 支持 Markdown 渲染
- 代码块语法高亮
- 支持复制功能

### 3.3 折叠与展开

**需求**: 信息详细但需要有折叠或只显示部分内容，点击能查看详情

**实现细节**:

**1. Thinking 内容**:
- 默认显示: 第一行或前 50 个字符
- 展开后: 显示完整内容
- 展开/折叠按钮: ▶ / ▼

**2. Tool Call 结果**:
- 默认显示: 工具名称、动作、状态
- 展开后: 显示完整的执行结果
- 结果过长时: 限制高度，显示滚动条

**3. 长文本内容**:
- 超过 500 字符: 显示"查看更多"按钮
- 点击后: 展开显示完整内容
- 代码块: 限制高度，显示滚动条

## 4. 技术实现

### 4.1 后端实现 (Rust)

**文件修改**:
1. `src-tauri/src/database/mod.rs`:
   - 更新数据库路径为 `~/.microcompany/data.db`
   - 添加 `timeline_items` 表的创建和查询逻辑

2. `src-tauri/src/claurst/mod.rs`:
   - 在流式输出时收集时间线数据
   - 区分 thinking、tool_call、output 三种类型
   - 在请求结束时保存时间线数据到数据库

3. `src-tauri/src/api/message_impl.rs`:
   - 扩展 `get_messages` 函数，同时加载时间线数据
   - 扩展 `save_message` 函数，保存时间线数据

**新增数据结构**:
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineItem {
    pub id: String,
    pub message_id: String,
    pub item_type: String,  // "thinking", "tool_call", "output"
    pub timestamp: i64,
    pub content: Option<String>,
    pub tool: Option<String>,
    pub action: Option<String>,
    pub status: Option<String>,
    pub result: Option<String>,
}
```

### 4.2 前端实现 (TypeScript/React)

**文件修改**:
1. `src/types/index.ts`:
   - 更新 `Message` 接口，添加 `timeline` 字段
   - 定义 `TimelineItem` 接口

2. `src/components/TimelineView.tsx`:
   - 实现时间线视图组件
   - 按时间顺序渲染时间线项

3. `src/components/ThinkingItem.tsx` (新增):
   - 实现 thinking 项的折叠/展开逻辑
   - 显示 AI 思考内容

4. `src/components/ToolCallItem.tsx`:
   - 重构现有组件，支持折叠/展开
   - 添加状态指示器和动画

5. `src/components/OutputItem.tsx` (新增):
   - 实现 AI 输出内容的渲染
   - 支持 Markdown 和代码高亮

6. `src/components/MessageItem.tsx`:
   - 集成 TimelineView 组件
   - 移除旧的工具调用显示逻辑

**CSS 样式**:
- 参考 Claude Code VS Code 插件的视觉设计
- 使用 CSS 变量定义颜色主题
- 实现平滑的过渡动画

### 4.3 数据库迁移

**迁移脚本** (`src-tauri/src/database/migration.rs`):
```rust
// 添加新的迁移版本
pub const LATEST_VERSION: i32 = 8;

// 迁移 008: 添加 timeline_items 表
pub fn migrate_008(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS timeline_items (
            id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL,
            type TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            content TEXT,
            tool TEXT,
            action TEXT,
            status TEXT,
            result TEXT,
            FOREIGN KEY (message_id) REFERENCES messages(id)
        )",
        [],
    )?;
    Ok(())
}
```

## 5. 实施计划

### 5.1 阶段 1: 数据库重构 (优先级: 高) - ✅ 已完成

**任务**:
1. ✅ 更新数据库路径为 `~/.microcompany/data.db`
2. ✅ 创建 `timeline_items` 表
3. ✅ 更新所有数据库连接代码
4. ✅ 测试数据库迁移逻辑

**完成时间**: 已完成

---

### 5.2 阶段 2: 后端时间线数据收集 (优先级: 高) - ✅ 已完成

**任务**:
1. ✅ 在 `claurst/mod.rs` 中收集时间线数据
2. ✅ 区分 thinking、tool_call、output 三种类型
3. ✅ 保存时间线数据到数据库
4. ✅ 测试数据收集和保存逻辑

**完成时间**: 已完成

---

### 5.3 阶段 3: 前端实时流式展示 (优先级: 🔴 **最高 - 核心功能**) - ⏳ **待实施**

**核心目标**: 实现实时流式展示，而不是历史数据展示

**任务清单**:

#### 3.1 前端状态管理重构
- [ ] 在 `MessageItem` 组件中添加 `realtimeTimeline` 状态
- [ ] 实现动态插入 timeline 项的逻辑（按时间戳排序）
- [ ] 区分实时 timeline 和历史 timeline

#### 3.2 实时事件监听
- [ ] 监听 `tool-call-start` 事件 → 立即插入工具调用项（状态: running）
- [ ] 监听 `tool-call-end` 事件 → 更新工具调用项（状态: success/error，显示结果）
- [ ] 监听 `message-chunk` 事件 → 实时追加输出内容
- [ ] 监听 thinking 相关事件（如果后端有发送）

#### 3.3 TimelineView 组件重构
- [ ] 修改 `TimelineView` 接受实时 timeline 数据
- [ ] 支持动态更新（新增、更新状态）
- [ ] 按时间顺序渲染所有项（thinking、tool_call、output 穿插展示）

#### 3.4 工具调用实时展示
- [ ] 工具调用开始时立即显示（状态: running，显示加载动画）
- [ ] 工具调用结束时更新状态和结果
- [ ] 显示工具名称、参数、执行结果
- [ ] 支持折叠/展开结果详情

#### 3.5 移除旧的工具调用展示
- [ ] 移除底部的独立工具调用区域
- [ ] 确保所有工具调用都在 timeline 中按时间顺序展示

**预计时间**: 4-6 小时

**验收标准**:
- ✅ 在 AI 流式输出过程中，thinking、tool_call、output 实时展示
- ✅ 工具调用立即显示，不是等到消息完成后才显示
- ✅ 所有内容按时间顺序穿插展示，不是分区域展示
- ✅ 工具调用显示详细信息（工具名、参数、结果）
- ✅ 用户能看到 AI 的实时工作过程

---

### 5.4 阶段 4: 样式优化 (优先级: 中) - ⏳ 待实施

**任务**:
1. 参考 Claude Code VS Code 插件的视觉设计
2. 优化颜色、间距、字体
3. 添加悬停和点击效果
4. 实现流式输出动画

**预计时间**: 2-3 小时

---

### 5.5 阶段 5: 测试与优化 (优先级: 中) - ⏳ 待实施

**任务**:
1. 端到端测试
2. 性能优化
3. 边界情况处理
4. 用户体验优化

**预计时间**: 2-3 小时

## 6. 验收标准

### 6.1 数据存储

- [ ] 数据库文件位于 `~/.microcompany/data.db`
- [ ] 所有配置文件位于 `~/.microcompany/config/`
- [ ] Task AI session 和 Chat AI session 的数据都存储到数据库
- [ ] 时间线数据正确保存到 `timeline_items` 表
- [ ] 刷新页面后，时间线数据能正确加载

### 6.2 UI 展示

- [ ] 时间线按时间顺序展示
- [ ] Thinking 内容默认折叠，点击可展开
- [ ] Tool Call 显示工具名称、动作、状态
- [ ] Tool Call 结果默认折叠，点击可展开
- [ ] Output 内容完整显示，支持 Markdown 渲染
- [ ] 不同类型的时间线项使用不同的视觉样式
- [ ] 流式输出时显示打字机效果
- [ ] 工具调用运行中显示加载动画

### 6.3 交互体验

- [ ] 折叠/展开动画平滑
- [ ] 悬停时显示视觉反馈
- [ ] 点击时显示交互反馈
- [ ] 长文本内容支持滚动
- [ ] 代码块支持语法高亮
- [ ] 支持复制 AI 回复内容

## 7. 风险与注意事项

### 7.1 数据迁移风险

**风险**: 用户可能有旧数据需要保留

**缓解措施**:
- 在应用启动时提示用户数据库位置已更改
- 提供选项让用户选择是否保留旧数据
- 提供数据导出功能（可选）

### 7.2 性能风险

**风险**: 时间线数据量大时可能影响性能

**缓解措施**:
- 使用虚拟滚动优化长列表渲染
- 分页加载历史消息
- 限制单次加载的时间线项数量
- 使用 React.memo 优化组件渲染

### 7.3 兼容性风险

**风险**: 新的时间线数据结构可能与现有代码不兼容

**缓解措施**:
- 保留旧的 `toolCalls` 字段用于向后兼容
- 逐步迁移到新的时间线数据结构
- 充分测试新旧数据结构的兼容性

## 8. 后续优化

### 8.1 短期优化 (1-2 周)

- 添加时间线项的搜索和过滤功能
- 支持导出时间线数据为 Markdown 或 JSON
- 添加时间线项的统计和分析功能

### 8.2 长期优化 (1-2 月)

- 支持时间线项的编辑和删除
- 添加时间线项的标签和分类
- 实现时间线的可视化图表
- 支持多会话的时间线对比

## 9. 参考资料

- Claude Code VS Code 插件: https://marketplace.visualstudio.com/items?itemName=Anthropic.claude-code
- SQLite 文档: https://www.sqlite.org/docs.html
- React 性能优化: https://react.dev/learn/render-and-commit
- Markdown 渲染库: https://github.com/remarkjs/react-markdown
