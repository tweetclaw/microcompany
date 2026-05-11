# 统一 Session 存储 — 技术说明

**文档类型**: 技术架构说明  
**创建日期**: 2026-05-08  
**状态**: ✅ 已实现

---

## 1. 功能概述

所有 AI Session（包括普通对话和 Task 对话）统一存储到 SQLite 数据库，替代原先普通 Session 使用 JSON 文件的方案。

### 1.1 旧方案问题

| 问题 | 说明 |
|------|------|
| 双重存储 | 普通 Session → `~/.microcompany/conversations/*.json`，Task Session → SQLite |
| 数据分散 | 备份和迁移复杂，无法统一查询 |
| 缺乏事务保证 | JSON 文件写入可能出现冲突或部分写入 |
| 关联困难 | 无法建立 normal sessions 和 task sessions 之间的关联 |

### 1.2 核心价值

1. **一致性**：所有 session 数据在一处，备份简单
2. **查询能力**：高效查询、过滤、统计（例如："所有使用 claude-opus 的会话"）
3. **事务安全**：SQLite ACID 保证
4. **级联删除**：`ON DELETE CASCADE` 自动清理关联数据

---

## 2. 数据库设计

### 2.1 表结构（Migration 001）

未创建独立的 `normal_sessions` / `normal_messages` 表，而是使用**统一的 `sessions` 和 `messages` 表**，通过 `type` 列区分会话类型。此设计从 Migration 001（initial_schema）起即已确定。

#### sessions 表

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('normal', 'task')),  -- 统一区分列
    name TEXT NOT NULL,
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    working_directory TEXT,
    status TEXT DEFAULT 'ready' CHECK(status IN ('initializing', 'ready', 'error', 'deleted')),
    error_message TEXT,
    task_id TEXT,       -- task session 关联的 task
    role_id TEXT,        -- task session 关联的 role
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- 关键索引
CREATE INDEX idx_sessions_type ON sessions(type);
CREATE INDEX idx_sessions_task_id ON sessions(task_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);
```

#### messages 表

```sql
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

CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

### 2.2 与原始计划的设计差异

| 方面 | 原始计划 | 最终实现 | 理由 |
|------|----------|----------|------|
| 表设计 | 新建 `normal_sessions` + `normal_messages` | 统一 `sessions` 表 + `type` 列 | 避免 schema 膨胀，统一管理 |
| 数据迁移 | Phase 2 编写 JSON→DB 迁移脚本 | 从 Migration 001 起即统一设计 | 系统从初始就使用统一存储 |
| 导出功能 | Phase 4 实现 JSON 导出 | 未实现 | 保留 `ConversationStorage` 文件存储层作为兼容路径 |
| `normal_sessions`/`normal_messages` 表 | 计划新建 | 未创建 | 统一设计消除了此需求 |

---

## 3. API 层

### 3.1 核心函数（`src-tauri/src/api/session_impl.rs`）

| 函数 | 说明 |
|------|------|
| `create_normal_session()` | 在 `sessions` 表插入 `type='normal'` 记录，创建 ClaurstSession |
| `get_session()` | 按 ID 查询 session 完整信息 |
| `list_normal_sessions()` | 查询 `WHERE type = 'normal'`，LEFT JOIN `messages` 统计消息数 |
| `delete_session()` | 数据库删除 session（级联删除 messages），同时清理 Claurst 文件存储 |

### 3.2 会话创建流程

```
create_normal_session(name, model, provider, working_directory)
  │
  ├─ 1. INSERT INTO sessions (type='normal', status='initializing', ...)
  │
  ├─ 2. 加载 provider 配置（验证 API key）
  │
  ├─ 3. 创建 ClaurstSession（进程级会话上下文）
  │    ├─ 成功 → UPDATE sessions SET status = 'ready'
  │    └─ 失败 → DELETE FROM sessions（回滚）＋ 返回错误
  │
  └─ 返回 session_id
```

### 3.3 会话列表查询

```sql
SELECT
    s.id, s.type, s.name, s.model, s.provider, s.status,
    COUNT(m.id) as message_count,
    s.created_at, s.updated_at
FROM sessions s
LEFT JOIN messages m ON m.session_id = s.id
WHERE s.type = 'normal'
  [AND s.working_directory = ?1]  -- 可选的工作目录过滤
GROUP BY s.id
ORDER BY s.created_at DESC
```

### 3.4 会话删除流程

```
delete_session(session_id)
  │
  ├─ 1. 验证 session 存在
  ├─ 2. 统计 message 数量（用于返回报告）
  ├─ 3. 事务内 DELETE FROM sessions（级联删除 messages）
  ├─ 4. 异步清理 Claurst 会话文件存储
  └─ 返回 DeleteSessionResult { deleted_session_id, deleted_message_count }
```

---

## 4. 消息存储兼容层

### 4.1 ConversationStorage

`ConversationStorage`（`src-tauri/src/storage/mod.rs`）作为兼容层保留：

- **消息加载**：`load_messages()` 优先从数据库查询（含 timeline 数据），数据库不可用时回退到 JSON 文件
- **会话文件存储**：Claurst 会话上下文仍使用 JSON 文件（`~/.microcompany/conversations/{session_id}.json`）
- **会话列表**：`list_all_sessions()` 仍扫描 JSON 目录（用于 Claurst 内部管理）

### 4.2 消息加载优先级

```
load_messages(session_id)
  │
  ├─ 1. 优先：从 messages + timeline_items 表查询（含完整 timeline）
  │    └─ 包含内容重建逻辑（从 timeline 重建输出文本）
  │
  └─ 2. 回退：从 JSON 文件加载（无 timeline 数据）
```

---

## 5. 向后兼容性

| 场景 | 兼容方式 |
|------|----------|
| 历史 JSON 文件 | `ConversationStorage` 保留文件读写能力 |
| 旧 session（无 timeline） | `load_messages()` 从文件回退加载 |
| 新 session | 统一通过数据库 API 创建，`sessions.type = 'normal'` |
| FTS5 全文搜索 | 跨 normal/task 消息统一搜索 |

---

## 6. 相关文件

| 文件 | 职责 |
|------|------|
| `src-tauri/migrations/001_initial_schema.sql` | 统一 `sessions` + `messages` 表定义 |
| `src-tauri/src/api/session_impl.rs` | 会话 CRUD API 实现 |
| `src-tauri/src/api/mod.rs` | API 模块导出 |
| `src-tauri/src/storage/mod.rs` | JSON 文件存储兼容层 |
| `src-tauri/src/lib.rs` | Tauri 命令注册（`list_normal_sessions` 等） |
| `src-tauri/src/database/migration.rs` | 迁移框架（9 个 migration） |

---

## 7. 未实施功能

以下原始计划中的功能因设计变更而未实施：

| 功能 | 原因 |
|------|------|
| Phase 2: JSON→DB 迁移脚本 | 统一 schema 从 Migration 001 开始，无需事后迁移 |
| Phase 4: JSON 导出功能 | `ConversationStorage` 文件存储层保留，天然支持双向存取 |
| `migrate_sessions_to_database` Tauri 命令 | 同上，无需显式迁移 |
