# Task-Session 架构重构方案

## 文档版本
- 创建日期：2026-04-20
- 最后更新：2026-04-20
- 作者：AI Assistant
- 状态：待审核

## 1. 背景与问题

### 1.1 当前架构问题
1. **Session 创建时机不明确**：Task 的角色对应的 Session 在什么时候创建不清晰
2. **转发消息失败**：当转发消息到目标角色时，如果目标角色还没有创建 Session，转发会失败
3. **Session 管理混乱**：Task 相关的 Session 和普通 Session 混在一起，难以区分和管理
4. **数据关系不清晰**：Task、Role、Session 三者的关系在数据结构中没有明确体现
5. **搜索能力缺失**：无法搜索对话内容，无法进行统计分析

### 1.2 用户需求
用户希望实现以下架构：
- 创建 Task 时，立即为每个角色创建对应的 Session
- Task Session 不存储在普通 Session 列表中，而是作为 Task 的子项
- Task Session 包含 `taskId` 和 `roleId` 信息，与普通 Session 区分
- UI 上 Task 列表可以展开，显示其下属的角色对应的 Session
- 支持搜索对话内容，支持统计分析

## 2. 新架构设计

### 2.1 核心概念

#### 2.1.1 数据存储方案
**使用 SQLite 数据库存储所有数据**

**优势**：
- **强大的查询能力**：支持复杂查询、全文搜索、统计分析
- **性能优秀**：索引加速、分页加载、增量更新
- **数据完整性**：外键约束、事务保证、ACID 特性
- **易于维护**：Schema 版本管理、数据迁移工具
- **备份简单**：单个文件，直接复制即可
- **跨平台**：SQLite 无需服务器，嵌入式数据库

#### 2.1.2 Session 类型划分
```typescript
// Session 基础类型
interface BaseSession {
  id: string;
  name: string;
  model: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
}

// 普通 Session（独立存在）
interface NormalSession extends BaseSession {
  type: 'normal';
}

// Task Session（隶属于 Task）
interface TaskSession extends BaseSession {
  type: 'task';
  taskId: string;      // 所属 Task ID
  roleId: string;      // 所属 Role ID
}

type Session = NormalSession | TaskSession;
```

#### 2.1.3 Task 数据结构
```typescript
interface TaskRole {
  id: string;
  name: string;
  identity: string;
  model: string;
  provider: string;
  createdAt: string;
}

interface Task {
  id: string;
  name: string;
  description: string;
  icon: string;
  roles: TaskRole[];
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  requestId?: string;
  isStreaming: boolean;
}
```

### 2.2 数据库 Schema 设计

#### 2.2.1 完整 Schema
```sql
-- Tasks 表
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Roles 表
CREATE TABLE roles (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    name TEXT NOT NULL,
    identity TEXT,
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Sessions 表
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('normal', 'task')),
    name TEXT NOT NULL,
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    task_id TEXT,
    role_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- Messages 表
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    request_id TEXT,
    is_streaming BOOLEAN DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 全文搜索索引（SQLite FTS5）
CREATE VIRTUAL TABLE messages_fts USING fts5(
    content,
    content=messages,
    content_rowid=rowid
);

-- 触发器：自动更新全文搜索索引
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
    DELETE FROM messages_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
    UPDATE messages_fts SET content = new.content WHERE rowid = new.rowid;
END;

-- 触发器：自动更新 updated_at
CREATE TRIGGER tasks_update_timestamp AFTER UPDATE ON tasks BEGIN
    UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER sessions_update_timestamp AFTER UPDATE ON sessions BEGIN
    UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- 索引
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_messages_role ON messages(role);
CREATE INDEX idx_sessions_task_id ON sessions(task_id);
CREATE INDEX idx_sessions_type ON sessions(type);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);
CREATE INDEX idx_roles_task_id ON roles(task_id);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
```

#### 2.2.2 查询示例

**搜索对话内容**
```sql
-- 全文搜索
SELECT m.*, s.name as session_name
FROM messages_fts 
JOIN messages m ON messages_fts.rowid = m.rowid
JOIN sessions s ON m.session_id = s.id
WHERE messages_fts MATCH '错误 OR 异常'
ORDER BY m.created_at DESC
LIMIT 50;

-- 模糊搜索
SELECT * FROM messages 
WHERE content LIKE '%关键词%' 
ORDER BY created_at DESC;
```

**统计分析**
```sql
-- 每个 Task 的消息数量
SELECT t.name, COUNT(m.id) as message_count
FROM tasks t
JOIN roles r ON r.task_id = t.id
JOIN sessions s ON s.role_id = r.id
JOIN messages m ON m.session_id = s.id
GROUP BY t.id
ORDER BY message_count DESC;

-- 最活跃的 Session
SELECT s.name, s.type, COUNT(m.id) as msg_count
FROM sessions s
LEFT JOIN messages m ON m.session_id = s.id
GROUP BY s.id
ORDER BY msg_count DESC
LIMIT 10;

-- 每日消息统计
SELECT DATE(created_at) as date, COUNT(*) as count
FROM messages
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**获取 Task 及其所有 Session**
```sql
SELECT 
    t.*,
    r.id as role_id,
    r.name as role_name,
    s.id as session_id,
    s.name as session_name,
    COUNT(m.id) as message_count
FROM tasks t
LEFT JOIN roles r ON r.task_id = t.id
LEFT JOIN sessions s ON s.role_id = r.id
LEFT JOIN messages m ON m.session_id = s.id
WHERE t.id = ?
GROUP BY r.id, s.id;
```

### 2.3 存储结构

#### 2.3.1 目录结构
```
.mc/
├── data.db              # SQLite 数据库（所有数据）
├── backups/             # 备份目录
│   ├── data-2026-04-20.db
│   └── data-2026-04-19.db
└── logs/                # 日志目录（可选）
    └── app.log
```

#### 2.3.2 数据库文件
- **位置**：`.mc/data.db`
- **格式**：SQLite 3
- **大小**：动态增长，建议定期 VACUUM
- **备份**：每日自动备份到 `.mc/backups/`

### 2.4 生命周期管理

#### 2.4.1 Task 创建流程
```
1. 用户创建 Task
   ↓
2. 开启数据库事务
   ↓
3. 插入 Task 记录到 tasks 表
   ↓
4. 为每个 Role 执行：
   - 插入 Role 记录到 roles 表
   - 创建对应的 Session 记录到 sessions 表
   - 调用后端 API 创建 Claurst Session
   ↓
5. 如果所有操作成功：
   - 提交事务
   - 返回成功
   ↓
6. 如果任何操作失败：
   - 回滚事务
   - 删除已创建的 Claurst Session
   - 返回错误
```

#### 2.4.2 Task 删除流程
```
1. 用户删除 Task
   ↓
2. 显示确认对话框（显示将删除的 Session 和消息数量）
   ↓
3. 用户确认后，开启数据库事务
   ↓
4. 查询 Task 关联的所有 Session ID
   ↓
5. 调用后端 API 删除所有 Claurst Session
   ↓
6. 执行 DELETE FROM tasks WHERE id = ?
   （级联删除 roles, sessions, messages）
   ↓
7. 提交事务
   ↓
8. 刷新 UI
```

#### 2.4.3 消息转发流程
```
1. 用户点击 "Forward Latest Reply"
   ↓
2. 查询当前 Task 的所有 Role 和 Session
   ↓
3. 显示转发弹窗，列出其他角色
   ↓
4. 用户选择目标角色并添加备注
   ↓
5. 从数据库获取目标角色的 session_id（保证存在）
   ↓
6. 调用后端 API 转发消息到目标 Session
   ↓
7. 插入转发记录到 messages 表
   ↓
8. 显示成功提示，关闭弹窗
```

#### 2.4.4 消息存储流程
```
1. 用户发送消息
   ↓
2. 插入 user 消息到 messages 表
   ↓
3. 调用后端 API 发送消息
   ↓
4. 流式接收 assistant 回复
   - 创建 assistant 消息记录（is_streaming = true）
   - 实时更新 content 字段
   ↓
5. 回复完成后，更新 is_streaming = false
```

## 3. 实现计划

### 3.1 后端 API 变更

#### 3.1.1 数据库初始化
```rust
// 使用 rusqlite 或 sqlx
use rusqlite::{Connection, Result};

fn init_database(db_path: &str) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    
    // 执行 Schema 创建
    conn.execute_batch(include_str!("schema.sql"))?;
    
    // 启用外键约束
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    
    Ok(conn)
}
```

#### 3.1.2 新增 API
```rust
// 创建 Task（包含 Roles 和 Sessions）
#[tauri::command]
async fn create_task(
    task: TaskCreateRequest,
    working_directory: String,
) -> Result<Task, String>

// 删除 Task（级联删除 Roles 和 Sessions）
#[tauri::command]
async fn delete_task(
    task_id: String,
) -> Result<(), String>

// 获取 Task 及其所有 Session
#[tauri::command]
async fn get_task_with_sessions(
    task_id: String,
) -> Result<TaskWithSessions, String>

// 搜索消息
#[tauri::command]
async fn search_messages(
    query: String,
    session_id: Option<String>,
    limit: usize,
) -> Result<Vec<MessageSearchResult>, String>

// 获取统计信息
#[tauri::command]
async fn get_statistics() -> Result<Statistics, String>
```

#### 3.1.3 修改现有 API
```rust
// create_session 添加 session_type 参数
#[tauri::command]
async fn create_session(
    name: String,
    model: String,
    provider: String,
    working_directory: String,
    session_type: SessionType,  // enum: Normal, Task
    task_id: Option<String>,
    role_id: Option<String>,
) -> Result<String, String>

// 保存消息到数据库
#[tauri::command]
async fn save_message(
    session_id: String,
    role: String,
    content: String,
    request_id: Option<String>,
) -> Result<String, String>

// 加载消息（支持分页）
#[tauri::command]
async fn load_messages(
    session_id: String,
    limit: usize,
    offset: usize,
) -> Result<Vec<Message>, String>
```

### 3.2 前端组件变更

#### 3.2.1 新增/修改的文件
```
src/
├── types/
│   └── index.ts                    # 修改：添加 Session 类型定义
├── services/
│   ├── database.ts                 # 新增：数据库服务层
│   ├── sessionService.ts           # 新增：Session 管理服务
│   ├── taskService.ts              # 修改：添加 Task Session 创建逻辑
│   └── searchService.ts            # 新增：搜索服务
├── components/
│   ├── TaskBuilder.tsx             # 修改：创建 Task 时同时创建 Sessions
│   ├── TaskListPanel.tsx           # 修改：支持展开显示 Role Sessions
│   ├── ForwardLatestReplyModal.tsx # 修改：已修复 isForwarding 状态问题
│   └── SearchPanel.tsx             # 新增：搜索面板
└── App.tsx                         # 修改：Session 加载逻辑区分类型
```

#### 3.2.2 UI 变更
1. **TaskListPanel 组件**
   - 添加展开/折叠功能
   - 显示 Task 下的所有 Role Sessions
   - 显示每个 Session 的消息数量
   - 点击 Role Session 可以切换到对应的会话

2. **SessionList 组件**
   - 只显示 `type: 'normal'` 的 Session
   - 不显示 Task Session

3. **TaskBuilder 组件**
   - 创建 Task 时显示 "Creating sessions..." 加载状态
   - 显示创建进度（已创建 X/Y 个 Session）
   - 创建失败时提供重试机制

4. **SearchPanel 组件（新增）**
   - 全文搜索对话内容
   - 按 Session 过滤
   - 按时间范围过滤
   - 显示搜索结果（高亮关键词）

### 3.3 数据库迁移

**注意**：由于这是新开发的软件，**无需考虑旧数据迁移**。

首次启动时：
1. 检查 `.mc/data.db` 是否存在
2. 如果不存在，创建数据库并执行 Schema
3. 如果存在，检查 Schema 版本并执行必要的升级

## 4. 实现步骤

### Phase 1: 数据库 Schema 和基础设施（2-3 小时）
- [ ] 设计并创建完整的 SQL Schema
- [ ] 实现数据库初始化逻辑
- [ ] 添加数据库连接池管理
- [ ] 实现事务支持
- [ ] 添加数据库版本管理

### Phase 2: 后端 API 实现（3-4 小时）
- [ ] 实现 `create_task` API（包含事务）
- [ ] 实现 `delete_task` API（级联删除）
- [ ] 实现 `get_task_with_sessions` API
- [ ] 实现 `search_messages` API（全文搜索）
- [ ] 实现 `get_statistics` API
- [ ] 修改 `save_message` 和 `load_messages` API
- [ ] 添加单元测试

### Phase 3: 前端服务层（2-3 小时）
- [ ] 创建 database.ts 服务
- [ ] 创建 sessionService.ts
- [ ] 创建 taskService.ts
- [ ] 创建 searchService.ts
- [ ] 添加 TypeScript 类型定义

### Phase 4: Task 创建和删除流程（2-3 小时）
- [ ] 修改 TaskBuilder 组件
- [ ] 实现 Task Session 批量创建逻辑
- [ ] 添加进度显示
- [ ] 添加错误处理和重试机制
- [ ] 实现 Task 删除确认对话框

### Phase 5: UI 展示优化（2-3 小时）
- [ ] TaskListPanel 添加展开/折叠功能
- [ ] 显示 Role Sessions 列表和消息数量
- [ ] SessionList 过滤 Task Sessions
- [ ] 添加视觉区分（图标、颜色）

### Phase 6: 搜索功能（2-3 小时）
- [ ] 创建 SearchPanel 组件
- [ ] 实现全文搜索 UI
- [ ] 实现搜索结果展示
- [ ] 添加搜索过滤器（Session、时间范围）
- [ ] 实现关键词高亮

### Phase 7: 测试和优化（2-3 小时）
- [ ] 端到端测试
- [ ] 性能优化（查询优化、索引优化）
- [ ] 错误处理完善
- [ ] 文档更新

**总计：15-22 小时**

## 5. 风险和注意事项

### 5.1 技术风险
1. **并发创建 Session**：创建 Task 时需要为多个 Role 创建 Session，可能耗时较长
   - 缓解措施：使用并发创建，添加超时处理，显示进度

2. **数据库性能**：大量消息时查询性能可能下降
   - 缓解措施：合理使用索引，定期 VACUUM，考虑分页加载

3. **数据一致性**：Task 和 Session 的关联关系需要保持一致
   - 缓解措施：使用事务性操作，失败时回滚

4. **全文搜索性能**：FTS5 索引可能占用较多空间
   - 缓解措施：定期优化索引，考虑限制搜索结果数量

### 5.2 用户体验风险
1. **创建 Task 变慢**：需要创建多个 Session，用户等待时间增加
   - 缓解措施：显示进度条，提供后台创建选项

2. **数据库文件大小**：随着消息增多，数据库文件可能变大
   - 缓解措施：提供数据清理功能，定期备份和归档

### 5.3 数据安全风险
1. **数据丢失**：数据库文件损坏或误删除
   - 缓解措施：自动备份，提供恢复功能

2. **并发写入**：多个进程同时写入数据库
   - 缓解措施：SQLite 的锁机制，使用 WAL 模式

## 6. 成功标准

### 6.1 功能标准
- [ ] 创建 Task 时自动为所有 Role 创建 Session
- [ ] Task Session 和普通 Session 在存储和 UI 上完全隔离
- [ ] 转发消息功能正常工作，不再出现 "session not found" 错误
- [ ] 删除 Task 时自动清理所有关联的 Session 和消息
- [ ] TaskListPanel 可以展开显示 Role Sessions
- [ ] 支持全文搜索对话内容
- [ ] 支持统计分析（消息数量、活跃度等）

### 6.2 性能标准
- [ ] 创建包含 3 个 Role 的 Task 在 2 秒内完成
- [ ] 删除 Task 在 1 秒内完成
- [ ] 搜索 10000 条消息在 500ms 内返回结果
- [ ] 加载 Session 消息列表（100 条）在 200ms 内完成
- [ ] 数据库文件大小增长合理（1000 条消息约 1MB）

### 6.3 质量标准
- [ ] 所有新增代码有单元测试覆盖
- [ ] 端到端测试通过
- [ ] 无内存泄漏
- [ ] 错误处理完善，用户友好的错误提示
- [ ] 数据库事务正确使用，保证数据一致性

## 7. 后续优化方向

1. **高级搜索**：支持正则表达式、多条件组合搜索
2. **数据导出**：导出对话为 Markdown、JSON 等格式
3. **数据分析**：可视化统计图表（消息趋势、活跃时段）
4. **性能监控**：添加数据库查询性能监控
5. **离线支持**：支持离线创建 Task，在线时同步
6. **数据压缩**：对旧消息进行压缩存储
7. **多数据库支持**：支持切换不同的工作区数据库

## 8. 附录

### 8.1 相关文件清单
```
后端文件：
- src-tauri/src/database/mod.rs          # 数据库模块
- src-tauri/src/database/schema.sql      # SQL Schema
- src-tauri/src/database/migrations.rs   # 数据库迁移
- src-tauri/src/session.rs               # Session 管理
- src-tauri/src/task.rs                  # Task 管理
- src-tauri/src/search.rs                # 搜索功能

前端文件：
- src/types/index.ts
- src/services/database.ts
- src/services/sessionService.ts
- src/services/taskService.ts
- src/services/searchService.ts
- src/components/TaskBuilder.tsx
- src/components/TaskListPanel.tsx
- src/components/ForwardLatestReplyModal.tsx
- src/components/SearchPanel.tsx
- src/App.tsx

测试文件：
- src-tauri/src/database/tests.rs
- src/services/__tests__/sessionService.test.ts
- src/services/__tests__/taskService.test.ts
- src/components/__tests__/TaskBuilder.test.tsx
```

### 8.2 依赖库
**后端（Rust）**：
- `rusqlite` 或 `sqlx` - SQLite 数据库驱动
- `serde` - 序列化/反序列化
- `chrono` - 时间处理

**前端（TypeScript）**：
- 无需额外依赖，使用 Tauri 的 invoke API

### 8.3 数据库工具
- **SQLite Browser**：可视化查看和编辑数据库
- **sqlite3 CLI**：命令行工具，用于调试和维护
- **VACUUM**：定期执行以优化数据库文件大小

### 8.4 参考资料
- [SQLite FTS5 文档](https://www.sqlite.org/fts5.html)
- [SQLite 事务](https://www.sqlite.org/lang_transaction.html)
- [SQLite 性能优化](https://www.sqlite.org/optoverview.html)
- [Rusqlite 文档](https://docs.rs/rusqlite/)
