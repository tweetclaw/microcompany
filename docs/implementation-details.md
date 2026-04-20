# Task-Session 架构实施细节

## 文档信息
- 创建日期：2026-04-20
- 状态：待审核
- 依赖文档：refactor-task-session-architecture.md

---

## 1. Session 状态管理

### 1.1 状态定义

```sql
-- 添加状态字段到 sessions 表
ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'ready' 
    CHECK(status IN ('initializing', 'ready', 'error', 'deleted'));
ALTER TABLE sessions ADD COLUMN error_message TEXT;
```

**状态说明**：
- `initializing`: Session 正在创建中（调用 Claurst API 中）
- `ready`: Session 创建成功，可以使用
- `error`: Session 创建失败或运行时错误
- `deleted`: 软删除状态（保留记录但不可用）

### 1.2 状态转换流程

```
[创建请求] 
    ↓
[initializing] ──成功──> [ready]
    ↓
   失败
    ↓
[error]

[ready] ──删除──> [deleted]
```

### 1.3 TypeScript 类型定义

```typescript
type SessionStatus = 'initializing' | 'ready' | 'error' | 'deleted';

interface Session {
  id: string;
  type: 'normal' | 'task';
  name: string;
  model: string;
  provider: string;
  status: SessionStatus;
  errorMessage?: string;
  taskId?: string;
  roleId?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 1.4 状态同步机制

**问题**：数据库中的 Session 状态和 Claurst Session 状态可能不一致

**解决方案**：
1. 创建 Session 时先插入数据库记录（status='initializing'）
2. 调用 Claurst API 创建 Session
3. 成功后更新数据库状态为 'ready'
4. 失败后更新状态为 'error' 并记录错误信息

```rust
async fn create_session_with_status(
    conn: &Connection,
    session_data: SessionCreateRequest,
) -> Result<String, String> {
    let session_id = generate_session_id(&session_data);
    
    // 1. 插入数据库记录（initializing）
    conn.execute(
        "INSERT INTO sessions (id, type, name, model, provider, status, task_id, role_id) 
         VALUES (?1, ?2, ?3, ?4, ?5, 'initializing', ?6, ?7)",
        params![
            &session_id,
            &session_data.session_type,
            &session_data.name,
            &session_data.model,
            &session_data.provider,
            &session_data.task_id,
            &session_data.role_id,
        ],
    ).map_err(|e| format!("Failed to insert session: {}", e))?;
    
    // 2. 调用 Claurst API
    match create_claurst_session(&session_data).await {
        Ok(_) => {
            // 3. 成功：更新状态为 ready
            conn.execute(
                "UPDATE sessions SET status = 'ready' WHERE id = ?1",
                params![&session_id],
            ).map_err(|e| format!("Failed to update session status: {}", e))?;
            
            Ok(session_id)
        }
        Err(e) => {
            // 4. 失败：更新状态为 error
            conn.execute(
                "UPDATE sessions SET status = 'error', error_message = ?1 WHERE id = ?2",
                params![&e.to_string(), &session_id],
            ).map_err(|e| format!("Failed to update error status: {}", e))?;
            
            Err(format!("Failed to create Claurst session: {}", e))
        }
    }
}
```

---

## 2. 事务回滚与清理

### 2.1 问题描述

创建 Task 时需要为多个 Role 创建 Session。如果部分成功、部分失败，需要：
1. 回滚数据库事务
2. 清理已创建的 Claurst Session

### 2.2 完整实现

```rust
#[tauri::command]
async fn create_task_with_sessions(
    task: TaskCreateRequest,
    app_handle: tauri::AppHandle,
) -> Result<Task, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    
    // 用于追踪已创建的 Claurst Session
    let mut created_claurst_sessions = Vec::new();
    
    // 开启事务
    let tx = conn.transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;
    
    // 1. 插入 Task
    let task_id = generate_task_id();
    tx.execute(
        "INSERT INTO tasks (id, name, description, icon) VALUES (?1, ?2, ?3, ?4)",
        params![&task_id, &task.name, &task.description, &task.icon],
    ).map_err(|e| {
        format!("Failed to insert task: {}", e)
    })?;
    
    // 2. 为每个 Role 创建 Session
    for role in &task.roles {
        let role_id = generate_role_id();
        
        // 2.1 插入 Role
        tx.execute(
            "INSERT INTO roles (id, task_id, name, identity, model, provider) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![&role_id, &task_id, &role.name, &role.identity, &role.model, &role.provider],
        ).map_err(|e| {
            // 回滚并清理
            let _ = tx.rollback();
            cleanup_claurst_sessions(&created_claurst_sessions);
            format!("Failed to insert role: {}", e)
        })?;
        
        // 2.2 创建 Session（先插入数据库）
        let session_id = format!("task-{}-role-{}-session", task_id, role_id);
        tx.execute(
            "INSERT INTO sessions (id, type, name, model, provider, status, task_id, role_id) 
             VALUES (?1, 'task', ?2, ?3, ?4, 'initializing', ?5, ?6)",
            params![&session_id, &role.name, &role.model, &role.provider, &task_id, &role_id],
        ).map_err(|e| {
            let _ = tx.rollback();
            cleanup_clarust_sessions(&created_claurst_sessions);
            format!("Failed to insert session: {}", e)
        })?;
        
        // 2.3 调用 Claurst API 创建 Session
        match create_claurst_session_api(&session_id, &role).await {
            Ok(_) => {
                // 成功：更新状态
                tx.execute(
                    "UPDATE sessions SET status = 'ready' WHERE id = ?1",
                    params![&session_id],
                ).map_err(|e| {
                    let _ = tx.rollback();
                    cleanup_claurst_sessions(&created_claurst_sessions);
                    format!("Failed to update session status: {}", e)
                })?;
                
                // 记录已创建的 Session
                created_claurst_sessions.push(session_id.clone());
            }
            Err(e) => {
                // 失败：回滚数据库并清理已创建的 Claurst Session
                let _ = tx.rollback();
                cleanup_claurst_sessions(&created_claurst_sessions);
                return Err(format!("Failed to create Claurst session for role {}: {}", role.name, e));
            }
        }
    }
    
    // 3. 提交事务
    tx.commit()
        .map_err(|e| {
            // 提交失败：清理所有 Claurst Session
            cleanup_claurst_sessions(&created_claurst_sessions);
            format!("Failed to commit transaction: {}", e)
        })?;
    
    // 4. 返回创建的 Task
    Ok(Task {
        id: task_id,
        name: task.name,
        description: task.description,
        icon: task.icon,
        roles: task.roles,
        createdAt: chrono::Utc::now().to_rfc3339(),
        updatedAt: chrono::Utc::now().to_rfc3339(),
    })
}

// 清理已创建的 Claurst Session
fn cleanup_claurst_sessions(session_ids: &[String]) {
    for session_id in session_ids {
        // 异步删除，忽略错误（尽力而为）
        tokio::spawn(async move {
            let _ = delete_claurst_session_api(session_id).await;
        });
    }
}
```

### 2.3 错误处理策略

**原则**：
1. 数据库操作失败 → 立即回滚事务并清理 Claurst Session
2. Claurst API 调用失败 → 回滚事务并清理已创建的 Session
3. 清理操作失败 → 记录日志但不阻塞主流程（尽力而为）

**重试策略**：
- 数据库操作：不重试（事务保证原子性）
- Claurst API 调用：重试 3 次，指数退避（100ms, 200ms, 400ms）

```rust
async fn create_claurst_session_with_retry(
    session_id: &str,
    role: &RoleConfig,
    max_retries: u32,
) -> Result<(), String> {
    let mut retries = 0;
    let mut last_error = String::new();
    
    while retries <= max_retries {
        match create_claurst_session_api(session_id, role).await {
            Ok(_) => return Ok(()),
            Err(e) => {
                last_error = e.to_string();
                if retries < max_retries {
                    let delay = Duration::from_millis(100 * 2_u64.pow(retries));
                    tokio::time::sleep(delay).await;
                    retries += 1;
                } else {
                    break;
                }
            }
        }
    }
    
    Err(format!("Failed after {} retries: {}", max_retries, last_error))
}
```

---

## 3. 数据库版本管理

### 3.1 Schema 版本表

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 迁移脚本结构

```
src-tauri/migrations/
├── 001_initial_schema.sql
├── 002_add_session_status.sql
├── 003_add_soft_delete.sql
└── ...
```

### 3.3 迁移系统实现

```rust
use rusqlite::{Connection, params};
use std::fs;

struct Migration {
    version: i32,
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial_schema",
        sql: include_str!("../migrations/001_initial_schema.sql"),
    },
    Migration {
        version: 2,
        name: "add_session_status",
        sql: include_str!("../migrations/002_add_session_status.sql"),
    },
];

fn get_current_version(conn: &Connection) -> Result<i32, rusqlite::Error> {
    // 确保 schema_migrations 表存在
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    
    // 获取当前版本
    let version: Result<i32, _> = conn.query_row(
        "SELECT MAX(version) FROM schema_migrations",
        [],
        |row| row.get(0),
    );
    
    Ok(version.unwrap_or(0))
}

pub fn run_migrations(conn: &Connection) -> Result<(), String> {
    let current_version = get_current_version(conn)
        .map_err(|e| format!("Failed to get current version: {}", e))?;
    
    println!("Current schema version: {}", current_version);
    
    for migration in MIGRATIONS {
        if migration.version > current_version {
            println!("Applying migration {}: {}", migration.version, migration.name);
            
            // 开启事务
            let tx = conn.transaction()
                .map_err(|e| format!("Failed to start transaction: {}", e))?;
            
            // 执行迁移 SQL
            tx.execute_batch(migration.sql)
                .map_err(|e| format!("Failed to execute migration {}: {}", migration.version, e))?;
            
            // 记录迁移
            tx.execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?1, ?2)",
                params![migration.version, migration.name],
            ).map_err(|e| format!("Failed to record migration: {}", e))?;
            
            // 提交事务
            tx.commit()
                .map_err(|e| format!("Failed to commit migration: {}", e))?;
            
            println!("Migration {} applied successfully", migration.version);
        }
    }
    
    Ok(())
}
```

### 3.4 迁移脚本示例

**001_initial_schema.sql**:
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

-- 索引
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_sessions_task_id ON sessions(task_id);
CREATE INDEX idx_sessions_type ON sessions(type);
CREATE INDEX idx_roles_task_id ON roles(task_id);

-- 触发器：自动更新 updated_at
CREATE TRIGGER tasks_update_timestamp AFTER UPDATE ON tasks BEGIN
    UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER sessions_update_timestamp AFTER UPDATE ON sessions BEGIN
    UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

**002_add_session_status.sql**:
```sql
-- 添加状态字段
ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'ready' 
    CHECK(status IN ('initializing', 'ready', 'error', 'deleted'));

ALTER TABLE sessions ADD COLUMN error_message TEXT;

-- 更新现有记录的状态
UPDATE sessions SET status = 'ready' WHERE status IS NULL;
```

---

## 4. 性能优化配置

### 4.1 SQLite PRAGMA 配置

```rust
pub fn optimize_database(conn: &Connection) -> Result<(), rusqlite::Error> {
    // 1. WAL 模式（提升并发性能）
    conn.execute("PRAGMA journal_mode=WAL", [])?;
    
    // 2. 增加缓存大小（64MB）
    conn.execute("PRAGMA cache_size=-64000", [])?;
    
    // 3. 使用内存临时存储
    conn.execute("PRAGMA temp_store=MEMORY", [])?;
    
    // 4. 同步模式（NORMAL 平衡性能和安全）
    conn.execute("PRAGMA synchronous=NORMAL", [])?;
    
    // 5. 启用 mmap（256MB，提升读取性能）
    conn.execute("PRAGMA mmap_size=268435456", [])?;
    
    // 6. 外键约束
    conn.execute("PRAGMA foreign_keys=ON", [])?;
    
    Ok(())
}
```

### 4.2 连接池配置

```rust
use r2d2_sqlite::SqliteConnectionManager;
use r2d2::Pool;
use std::time::Duration;
use once_cell::sync::Lazy;

pub fn create_connection_pool(db_path: &str) -> Result<Pool<SqliteConnectionManager>, String> {
    let manager = SqliteConnectionManager::file(db_path)
        .with_init(|conn| {
            // 每个连接初始化时执行优化配置
            optimize_database(conn)
        });
    
    let pool = Pool::builder()
        .max_size(10)                           // 最大连接数
        .min_idle(Some(2))                      // 最小空闲连接数
        .connection_timeout(Duration::from_secs(5))  // 连接超时
        .build(manager)
        .map_err(|e| format!("Failed to create connection pool: {}", e))?;
    
    Ok(pool)
}

// 全局连接池（在应用启动时初始化）
static DB_POOL: Lazy<Pool<SqliteConnectionManager>> = Lazy::new(|| {
    let db_path = std::env::var("DATABASE_PATH")
        .unwrap_or_else(|_| ".mc/data.db".to_string());
    create_connection_pool(&db_path).expect("Failed to create database pool")
});

// 在 API 中使用连接池
#[tauri::command]
pub async fn create_task(
    task: TaskCreateRequest,
    app_handle: tauri::AppHandle,
) -> Result<Task, String> {
    let conn = DB_POOL.get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    
    // 使用连接...
}
```

### 4.3 查询优化

**使用覆盖索引**：
```sql
-- 创建覆盖索引，避免回表
CREATE INDEX idx_messages_session_created_content 
ON messages(session_id, created_at DESC, id, role, content);

-- 查询时可以直接从索引获取所有数据
SELECT id, role, content, created_at 
FROM messages 
WHERE session_id = ? 
ORDER BY created_at DESC 
LIMIT 100;
```

**分页查询**：
```sql
-- 使用 LIMIT 和 OFFSET 分页
SELECT * FROM messages 
WHERE session_id = ? 
ORDER BY created_at DESC 
LIMIT 100 OFFSET ?;
```

**使用 EXPLAIN QUERY PLAN 分析**：
```sql
EXPLAIN QUERY PLAN
SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC;
```

### 4.4 批量操作优化

**批量插入消息**：
```rust
pub fn batch_insert_messages(
    conn: &Connection,
    messages: &[Message],
) -> Result<(), rusqlite::Error> {
    let tx = conn.transaction()?;
    
    {
        let mut stmt = tx.prepare(
            "INSERT INTO messages (id, session_id, role, content, created_at) 
             VALUES (?1, ?2, ?3, ?4, ?5)"
        )?;
        
        for msg in messages {
            stmt.execute(params![
                &msg.id,
                &msg.session_id,
                &msg.role,
                &msg.content,
                &msg.created_at,
            ])?;
        }
    }
    
    tx.commit()?;
    Ok(())
}
```

---

## 5. 初始化流程

### 5.1 应用启动时的数据库初始化

```rust
#[tauri::command]
pub async fn initialize_database(app_handle: tauri::AppHandle) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    
    // 1. 确保目录存在
    if let Some(parent) = Path::new(&db_path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create database directory: {}", e))?;
    }
    
    // 2. 打开数据库连接
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    
    // 3. 应用性能优化配置
    optimize_database(&conn)
        .map_err(|e| format!("Failed to optimize database: {}", e))?;
    
    // 4. 运行迁移
    run_migrations(&conn)
        .map_err(|e| format!("Failed to run migrations: {}", e))?;
    
    // 5. 验证数据库完整性
    conn.execute("PRAGMA integrity_check", [])
        .map_err(|e| format!("Database integrity check failed: {}", e))?;
    
    Ok(())
}

fn get_db_path(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Failed to get app data directory")?;
    
    let db_path = app_dir.join(".mc").join("data.db");
    Ok(db_path.to_string_lossy().to_string())
}
```

### 5.2 前端初始化调用

```typescript
// src/services/database.ts
import { invoke } from '@tauri-apps/api/tauri';

export async function initializeDatabase(): Promise<void> {
  try {
    await invoke('initialize_database');
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

// src/App.tsx
useEffect(() => {
  async function init() {
    try {
      await initializeDatabase();
      // 继续其他初始化...
    } catch (error) {
      // 显示错误提示
      alert(`Failed to initialize database: ${error}`);
    }
  }
  
  init();
}, []);
```

---

## 6. 错误处理

### 6.1 错误类型定义

```rust
#[derive(Debug)]
pub enum DatabaseError {
    ConnectionFailed(String),
    QueryFailed(String),
    TransactionFailed(String),
    ConstraintViolation(String),
    NotFound(String),
    MigrationFailed(String),
}

impl std::fmt::Display for DatabaseError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            DatabaseError::ConnectionFailed(msg) => write!(f, "Connection failed: {}", msg),
            DatabaseError::QueryFailed(msg) => write!(f, "Query failed: {}", msg),
            DatabaseError::TransactionFailed(msg) => write!(f, "Transaction failed: {}", msg),
            DatabaseError::ConstraintViolation(msg) => write!(f, "Constraint violation: {}", msg),
            DatabaseError::NotFound(msg) => write!(f, "Not found: {}", msg),
            DatabaseError::MigrationFailed(msg) => write!(f, "Migration failed: {}", msg),
        }
    }
}

impl std::error::Error for DatabaseError {}

impl From<rusqlite::Error> for DatabaseError {
    fn from(err: rusqlite::Error) -> Self {
        match err {
            rusqlite::Error::SqliteFailure(_, _) => {
                DatabaseError::QueryFailed(err.to_string())
            }
            rusqlite::Error::QueryReturnedNoRows => {
                DatabaseError::NotFound(err.to_string())
            }
            _ => DatabaseError::QueryFailed(err.to_string()),
        }
    }
}
```

### 6.2 用户友好的错误提示

```typescript
// src/utils/errorHandler.ts
export function handleDatabaseError(error: any): string {
  const errorStr = String(error);
  
  if (errorStr.includes('Connection failed')) {
    return '无法连接到数据库，请检查应用权限';
  } else if (errorStr.includes('Constraint violation')) {
    return '数据冲突，请刷新后重试';
  } else if (errorStr.includes('Not found')) {
    return '数据不存在，可能已被删除';
  } else if (errorStr.includes('Migration failed')) {
    return '数据库升级失败，请联系技术支持';
  } else {
    return `操作失败: ${errorStr}`;
  }
}
```

---

## 7. 总结

本文档补充了重构方案中的关键技术细节：

1. **Session 状态管理**：定义了 4 种状态和完整的状态转换流程
2. **事务回滚**：实现了完整的回滚和清理逻辑，保证数据一致性
3. **数据库版本管理**：实现了迁移系统，支持 Schema 演进
4. **性能优化**：提供了 SQLite PRAGMA 配置和连接池配置
5. **初始化流程**：定义了应用启动时的数据库初始化步骤
6. **错误处理**：定义了错误类型和用户友好的错误提示

这些细节是实施重构方案的基础，必须在开始编码前确认无误。
