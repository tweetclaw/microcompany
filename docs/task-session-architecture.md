# Task-Session 架构文档

## 文档信息
- 创建日期：2026-04-20
- 最后更新：2026-04-22
- 状态：✅ 已实施完成
- 作者：AI Assistant

---

## 1. 背景与问题

### 1.1 原有架构问题
1. **Session 创建时机不明确**：Task 的角色对应的 Session 在什么时候创建不清晰
2. **转发消息失败**：当转发消息到目标角色时，如果目标角色还没有创建 Session，转发会失败
3. **Session 管理混乱**：Task 相关的 Session 和普通 Session 混在一起，难以区分和管理
4. **数据关系不清晰**：Task、Role、Session 三者的关系在数据结构中没有明确体现
5. **搜索能力缺失**：无法搜索对话内容，无法进行统计分析

### 1.2 解决方案
- 创建 Task 时，立即为每个角色创建对应的 Session
- Task Session 不存储在普通 Session 列表中，而是作为 Task 的子项
- Task Session 包含 `taskId` 和 `roleId` 信息，与普通 Session 区分
- UI 上 Task 列表可以展开，显示其下属的角色对应的 Session
- 使用 SQLite 数据库支持搜索对话内容和统计分析

---

## 2. 架构设计

### 2.1 数据存储方案

**使用 SQLite 数据库存储所有数据**

**优势**：
- **强大的查询能力**：支持复杂查询、全文搜索、统计分析
- **性能优秀**：索引加速、分页加载、增量更新
- **数据完整性**：外键约束、事务保证、ACID 特性
- **易于维护**：Schema 版本管理、数据迁移工具
- **备份简单**：单个文件，直接复制即可
- **跨平台**：SQLite 无需服务器，嵌入式数据库

### 2.2 Session 类型划分

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

### 2.3 Task 数据结构

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

### 2.4 数据库 Schema

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
    status TEXT DEFAULT 'ready' CHECK(status IN ('initializing', 'ready', 'error', 'deleted')),
    error_message TEXT,
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
    tokenize='simple',
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
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);
CREATE INDEX idx_roles_task_id ON roles(task_id);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
```

### 2.5 查询示例

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
```

### 2.6 存储结构

```
.mc/
├── data.db              # SQLite 数据库（所有数据）
├── backups/             # 备份目录
│   ├── data-2026-04-20.db
│   └── data-2026-04-19.db
└── logs/                # 日志目录（可选）
    └── app.log
```

---

## 3. 生命周期管理

### 3.1 Task 创建流程

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

### 3.2 Task 删除流程

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

### 3.3 消息转发流程

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

---

## 4. 实施状态

### 4.1 已完成的部分

✅ **后端基础设施**
- 数据库模块：[src-tauri/src/database/mod.rs](../src-tauri/src/database/mod.rs)
- 连接池管理：[src-tauri/src/database/pool.rs](../src-tauri/src/database/pool.rs)
- 迁移系统：[src-tauri/src/database/migration.rs](../src-tauri/src/database/migration.rs)
- 错误处理：[src-tauri/src/database/error.rs](../src-tauri/src/database/error.rs)

✅ **API 实现**
- Task API：[src-tauri/src/api/task.rs](../src-tauri/src/api/task.rs)
- Session API：[src-tauri/src/api/session.rs](../src-tauri/src/api/session.rs)
- Message API：[src-tauri/src/api/message.rs](../src-tauri/src/api/message.rs)
- Search API：[src-tauri/src/api/search_impl.rs](../src-tauri/src/api/search_impl.rs)
- Statistics API：[src-tauri/src/api/statistics_impl.rs](../src-tauri/src/api/statistics_impl.rs)
- Backup API：[src-tauri/src/api/backup_impl.rs](../src-tauri/src/api/backup_impl.rs)

✅ **数据库依赖**
- rusqlite 0.31 已添加到 Cargo.toml

✅ **迁移脚本**
- 初始 Schema：[src-tauri/migrations/001_initial_schema.sql](../src-tauri/migrations/001_initial_schema.sql)

---

## 5. 测试指南

### 5.1 单元测试

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migration_system() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        
        let version: i32 = conn.query_row(
            "SELECT MAX(version) FROM schema_migrations",
            [],
            |row| row.get(0),
        ).unwrap();
        
        assert_eq!(version, 1);
    }

    #[tokio::test]
    async fn test_create_task() {
        // 测试创建 Task
    }

    #[tokio::test]
    async fn test_create_task_rollback() {
        // 测试失败时的回滚
    }
}
```

### 5.2 集成测试

1. 创建 Task 并验证数据库记录
2. 删除 Task 并验证级联删除
3. 搜索消息并验证 FTS5 索引
4. 并发创建多个 Task

### 5.3 E2E 测试

1. 启动应用，验证数据库初始化
2. 创建 Task，验证 UI 更新
3. 发送消息，验证消息保存
4. 搜索消息，验证搜索结果
5. 删除 Task，验证数据清理

---

## 6. 运维手册

### 6.1 数据库备份

```bash
# 手动备份
cp .mc/data.db .mc/backups/data-$(date +%Y-%m-%d).db

# 自动备份（应用启动时）
# 已在代码中实现
```

### 6.2 数据库优化

```bash
# 使用 SQLite CLI 优化数据库
sqlite3 .mc/data.db "VACUUM;"
sqlite3 .mc/data.db "ANALYZE;"
```

### 6.3 查看数据库状态

```bash
# 查看当前 Schema 版本
sqlite3 .mc/data.db "SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 1;"

# 查看数据库大小
ls -lh .mc/data.db

# 查看表统计
sqlite3 .mc/data.db "SELECT name, COUNT(*) FROM sqlite_master WHERE type='table' GROUP BY name;"
```

### 6.4 性能监控指标

**数据库性能**
- 查询响应时间
- 写入响应时间
- 数据库文件大小

**错误率**
- 数据库连接失败率
- 事务失败率
- Session 创建失败率

**用户体验**
- Task 创建耗时
- 消息搜索耗时
- 应用启动耗时

---

## 7. 常见问题

### Q1: 数据库文件损坏怎么办？

A: 使用备份恢复：
```bash
cp .mc/backups/data-2026-04-20.db .mc/data.db
```

### Q2: 迁移失败怎么办？

A: 检查日志，确定失败的迁移版本，修复后重新运行。

### Q3: 如何手动运行迁移？

A: 使用 SQLite CLI：
```bash
sqlite3 .mc/data.db < src-tauri/migrations/001_initial_schema.sql
```

### Q4: 如何查看当前数据库版本？

A: 
```sql
SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 1;
```

### Q5: 如何清理旧数据？

A: 
```sql
-- 删除 30 天前的消息
DELETE FROM messages WHERE created_at < datetime('now', '-30 days');

-- 优化数据库
VACUUM;
```

---

## 8. 风险和注意事项

### 8.1 技术风险

1. **并发创建 Session**：创建 Task 时需要为多个 Role 创建 Session，可能耗时较长
   - 缓解措施：使用并发创建，添加超时处理，显示进度

2. **数据库性能**：大量消息时查询性能可能下降
   - 缓解措施：合理使用索引，定期 VACUUM，考虑分页加载

3. **数据一致性**：Task 和 Session 的关联关系需要保持一致
   - 缓解措施：使用事务性操作，失败时回滚

### 8.2 数据安全

1. **数据丢失**：数据库文件损坏或误删除
   - 缓解措施：自动备份，提供恢复功能

2. **并发写入**：多个进程同时写入数据库
   - 缓解措施：SQLite 的锁机制，使用 WAL 模式

---

## 9. 后续优化方向

1. **高级搜索**：支持正则表达式、多条件组合搜索
2. **数据导出**：导出对话为 Markdown、JSON 等格式
3. **数据分析**：可视化统计图表（消息趋势、活跃时段）
4. **性能监控**：添加数据库查询性能监控
5. **离线支持**：支持离线创建 Task，在线时同步
6. **数据压缩**：对旧消息进行压缩存储
7. **多数据库支持**：支持切换不同的工作区数据库

---

## 10. 参考资料

- [SQLite FTS5 文档](https://www.sqlite.org/fts5.html)
- [SQLite 事务](https://www.sqlite.org/lang_transaction.html)
- [SQLite 性能优化](https://www.sqlite.org/optoverview.html)
- [Rusqlite 文档](https://docs.rs/rusqlite/)

---

## 附录：相关文件清单

**后端文件**：
- [src-tauri/src/database/mod.rs](../src-tauri/src/database/mod.rs) - 数据库模块
- [src-tauri/src/database/pool.rs](../src-tauri/src/database/pool.rs) - 连接池管理
- [src-tauri/src/database/migration.rs](../src-tauri/src/database/migration.rs) - 数据库迁移
- [src-tauri/src/database/error.rs](../src-tauri/src/database/error.rs) - 错误处理
- [src-tauri/migrations/001_initial_schema.sql](../src-tauri/migrations/001_initial_schema.sql) - 初始 Schema
- [src-tauri/src/api/task.rs](../src-tauri/src/api/task.rs) - Task API
- [src-tauri/src/api/session.rs](../src-tauri/src/api/session.rs) - Session API
- [src-tauri/src/api/message.rs](../src-tauri/src/api/message.rs) - Message API
- [src-tauri/src/api/search_impl.rs](../src-tauri/src/api/search_impl.rs) - 搜索功能
- [src-tauri/src/api/statistics_impl.rs](../src-tauri/src/api/statistics_impl.rs) - 统计功能
- [src-tauri/src/api/backup_impl.rs](../src-tauri/src/api/backup_impl.rs) - 备份功能

**依赖库**：
- `rusqlite = "0.31"` - SQLite 数据库驱动
- `serde` - 序列化/反序列化
- `chrono` - 时间处理
