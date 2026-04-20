# 数据库迁移实施指南

## 文档信息
- 创建日期：2026-04-20
- 状态：待审核
- 依赖文档：refactor-task-session-architecture.md, implementation-details.md, api-specification.md

---

## 1. 迁移概述

### 1.1 架构说明

这是新开发的软件，直接使用 SQLite 数据库架构：
- **数据库位置**：`.mc/data.db`
- **备份目录**：`.mc/backups/`
- **无需迁移旧数据**

### 1.2 数据库 Schema

**数据库包含的表**：
- Tasks（任务）
- Roles（角色）
- Sessions（会话）
- Messages（消息）
- schema_migrations（版本管理）

### 1.3 初始化策略

**应用启动流程**：
- 检查 `.mc/data.db` 是否存在
- 不存在则创建数据库并运行所有迁移脚本
- 存在则检查 schema 版本并运行增量迁移（用于未来版本升级）

---

## 2. 实施步骤

### Phase 1: 数据库基础设施（2-3 小时）

#### 2.1.0 添加依赖

**文件**：`src-tauri/Cargo.toml`

```toml
[dependencies]
rusqlite = { version = "0.31", features = ["bundled"] }
r2d2 = "0.8"
r2d2_sqlite = "0.24"
uuid = { version = "1.0", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
once_cell = "1.19"
```

#### 2.1.1 创建迁移脚本目录

```bash
mkdir -p src-tauri/migrations
```

#### 2.1.2 编写初始 Schema 迁移脚本

**文件**：`src-tauri/migrations/001_initial_schema.sql`

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
-- 使用 simple 分词器以更好地支持中文搜索
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

#### 2.1.3 实现迁移系统

**文件**：`src-tauri/src/database/migration.rs`

```rust
use rusqlite::{Connection, params};

pub struct Migration {
    pub version: i32,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial_schema",
        sql: include_str!("../../migrations/001_initial_schema.sql"),
    },
];

fn ensure_migrations_table(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    Ok(())
}

fn get_current_version(conn: &Connection) -> Result<i32, rusqlite::Error> {
    ensure_migrations_table(conn)?;
    
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
            
            let tx = conn.transaction()
                .map_err(|e| format!("Failed to start transaction: {}", e))?;
            
            tx.execute_batch(migration.sql)
                .map_err(|e| format!("Failed to execute migration {}: {}", migration.version, e))?;
            
            tx.execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?1, ?2)",
                params![migration.version, migration.name],
            ).map_err(|e| format!("Failed to record migration: {}", e))?;
            
            tx.commit()
                .map_err(|e| format!("Failed to commit migration: {}", e))?;
            
            println!("Migration {} applied successfully", migration.version);
        }
    }
    
    Ok(())
}
```

#### 2.1.4 实现数据库初始化

**文件**：`src-tauri/src/database/mod.rs`

```rust
use rusqlite::Connection;
use std::path::Path;
use std::fs;

mod migration;

pub fn optimize_database(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute("PRAGMA journal_mode=WAL", [])?;
    conn.execute("PRAGMA cache_size=-64000", [])?;
    conn.execute("PRAGMA temp_store=MEMORY", [])?;
    conn.execute("PRAGMA synchronous=NORMAL", [])?;
    conn.execute("PRAGMA mmap_size=268435456", [])?;
    conn.execute("PRAGMA foreign_keys=ON", [])?;
    Ok(())
}

pub fn initialize_database(db_path: &str) -> Result<(), String> {
    // 确保目录存在
    if let Some(parent) = Path::new(db_path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create database directory: {}", e))?;
    }
    
    // 打开数据库连接
    let conn = Connection::open(db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    
    // 应用性能优化配置
    optimize_database(&conn)
        .map_err(|e| format!("Failed to optimize database: {}", e))?;
    
    // 运行迁移
    migration::run_migrations(&conn)?;
    
    // 验证数据库完整性
    conn.execute("PRAGMA integrity_check", [])
        .map_err(|e| format!("Database integrity check failed: {}", e))?;
    
    println!("Database initialized successfully at {}", db_path);
    Ok(())
}
```

#### 2.1.5 添加 Tauri 命令

**文件**：`src-tauri/src/main.rs`

```rust
mod database;

#[tauri::command]
async fn initialize_database(app_handle: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Failed to get app data directory")?;
    
    let db_path = app_dir.join(".mc").join("data.db");
    let db_path_str = db_path.to_string_lossy().to_string();
    
    database::initialize_database(&db_path_str)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            initialize_database,
            // ... 其他命令
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

### Phase 2: Task 和 Session 创建（3-4 小时）

#### 2.2.1 实现 create_task API

**文件**：`src-tauri/src/api/task.rs`

```rust
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct TaskCreateRequest {
    pub name: String,
    pub description: String,
    pub icon: String,
    pub roles: Vec<RoleConfig>,
}

#[derive(Deserialize)]
pub struct RoleConfig {
    pub name: String,
    pub identity: String,
    pub model: String,
    pub provider: String,
}

#[derive(Serialize)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub roles: Vec<TaskRole>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct TaskRole {
    pub id: String,
    pub name: String,
    pub identity: String,
    pub model: String,
    pub provider: String,
    pub session_id: String,
    pub created_at: String,
}

#[tauri::command]
pub async fn create_task(
    task: TaskCreateRequest,
    app_handle: tauri::AppHandle,
) -> Result<Task, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    
    let mut created_claurst_sessions = Vec::new();
    let tx = conn.transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;
    
    // 生成 Task ID
    let task_id = format!("task-{}", uuid::Uuid::new_v4());
    
    // 插入 Task
    tx.execute(
        "INSERT INTO tasks (id, name, description, icon) VALUES (?1, ?2, ?3, ?4)",
        params![&task_id, &task.name, &task.description, &task.icon],
    ).map_err(|e| {
        format!("Failed to insert task: {}", e)
    })?;
    
    let mut task_roles = Vec::new();
    
    // 为每个 Role 创建 Session
    for role in &task.roles {
        let role_id = format!("role-{}", uuid::Uuid::new_v4());
        
        // 插入 Role
        tx.execute(
            "INSERT INTO roles (id, task_id, name, identity, model, provider) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![&role_id, &task_id, &role.name, &role.identity, &role.model, &role.provider],
        ).map_err(|e| {
            let _ = tx.rollback();
            cleanup_claurst_sessions(&created_claurst_sessions);
            format!("Failed to insert role: {}", e)
        })?;
        
        // 创建 Session（添加随机性避免冲突）
        let session_id = format!("task-{}-role-{}-{}", task_id, role_id, uuid::Uuid::new_v4());
        tx.execute(
            "INSERT INTO sessions (id, type, name, model, provider, status, task_id, role_id) 
             VALUES (?1, 'task', ?2, ?3, ?4, 'initializing', ?5, ?6)",
            params![&session_id, &role.name, &role.model, &role.provider, &task_id, &role_id],
        ).map_err(|e| {
            let _ = tx.rollback();
            cleanup_claurst_sessions(&created_claurst_sessions);
            format!("Failed to insert session: {}", e)
        })?;
        
        // 调用 Claurst API 创建 Session
        match create_claurst_session_with_retry(&session_id, role, 3).await {
            Ok(_) => {
                tx.execute(
                    "UPDATE sessions SET status = 'ready' WHERE id = ?1",
                    params![&session_id],
                ).map_err(|e| {
                    let _ = tx.rollback();
                    cleanup_claurst_sessions(&created_claurst_sessions);
                    format!("Failed to update session status: {}", e)
                })?;
                
                created_claurst_sessions.push(session_id.clone());
                
                task_roles.push(TaskRole {
                    id: role_id,
                    name: role.name.clone(),
                    identity: role.identity.clone(),
                    model: role.model.clone(),
                    provider: role.provider.clone(),
                    session_id: session_id.clone(),
                    created_at: chrono::Utc::now().to_rfc3339(),
                });
            }
            Err(e) => {
                let _ = tx.rollback();
                cleanup_claurst_sessions(&created_claurst_sessions);
                return Err(format!("Failed to create Claurst session for role {}: {}", role.name, e));
            }
        }
    }
    
    // 提交事务
    tx.commit()
        .map_err(|e| {
            cleanup_claurst_sessions(&created_claurst_sessions);
            format!("Failed to commit transaction: {}", e)
        })?;
    
    Ok(Task {
        id: task_id,
        name: task.name,
        description: task.description,
        icon: task.icon,
        roles: task_roles,
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    })
}

fn cleanup_claurst_sessions(session_ids: &[String]) {
    for session_id in session_ids {
        tokio::spawn(async move {
            let _ = delete_claurst_session_api(session_id).await;
        });
    }
}

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
                    let delay = std::time::Duration::from_millis(100 * 2_u64.pow(retries));
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

### Phase 3: 前端集成（2-3 小时）

#### 2.3.1 创建数据库服务

**文件**：`src/services/database.ts`

```typescript
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
```

#### 2.3.2 创建 Task 服务

**文件**：`src/services/taskService.ts`

```typescript
import { invoke } from '@tauri-apps/api/tauri';

export interface TaskCreateRequest {
  name: string;
  description: string;
  icon: string;
  roles: RoleConfig[];
}

export interface RoleConfig {
  name: string;
  identity: string;
  model: string;
  provider: string;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  icon: string;
  roles: TaskRole[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskRole {
  id: string;
  name: string;
  identity: string;
  model: string;
  provider: string;
  sessionId: string;
  createdAt: string;
}

export class TaskService {
  static async createTask(request: TaskCreateRequest): Promise<Task> {
    try {
      return await invoke<Task>('create_task', { task: request });
    } catch (error) {
      throw new Error(`Failed to create task: ${error}`);
    }
  }

  static async listTasks(): Promise<Task[]> {
    try {
      return await invoke<Task[]>('list_tasks');
    } catch (error) {
      throw new Error(`Failed to list tasks: ${error}`);
    }
  }

  static async deleteTask(taskId: string): Promise<void> {
    try {
      await invoke('delete_task', { taskId });
    } catch (error) {
      throw new Error(`Failed to delete task: ${error}`);
    }
  }
}
```

#### 2.3.3 在 App 启动时初始化数据库

**文件**：`src/App.tsx`

```typescript
import { initializeDatabase } from './services/database';

function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        await initializeDatabase();
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize database:', error);
        setInitError(String(error));
      }
    }
    
    init();
  }, []);

  if (initError) {
    return (
      <div className="init-error">
        <h1>Failed to Initialize Database</h1>
        <p>{initError}</p>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="init-loading">
        <p>Initializing database...</p>
      </div>
    );
  }

  return (
    // 正常的应用界面
  );
}
```

---

## 3. 测试计划

### 3.1 单元测试

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

### 3.2 集成测试

1. 创建 Task 并验证数据库记录
2. 删除 Task 并验证级联删除
3. 搜索消息并验证 FTS5 索引
4. 并发创建多个 Task

### 3.3 E2E 测试

1. 启动应用，验证数据库初始化
2. 创建 Task，验证 UI 更新
3. 发送消息，验证消息保存
4. 搜索消息，验证搜索结果
5. 删除 Task，验证数据清理

---

## 4. 回滚计划

如果迁移失败，回滚步骤：

1. 停止应用
2. 删除 `.mc/data.db`
3. 恢复备份（如果有）
4. 重新启动应用

---

## 5. 上线检查清单

- [ ] 所有迁移脚本已编写并测试
- [ ] 数据库初始化逻辑已实现
- [ ] 所有 API 已实现并测试
- [ ] 前端服务层已实现
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] E2E 测试通过
- [ ] 性能测试通过
- [ ] 备份和恢复机制已实现
- [ ] 错误处理已完善
- [ ] 文档已更新

---

## 6. 监控指标

上线后需要监控的指标：

1. **数据库性能**
   - 查询响应时间
   - 写入响应时间
   - 数据库文件大小

2. **错误率**
   - 数据库连接失败率
   - 事务失败率
   - Session 创建失败率

3. **用户体验**
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
sqlite3 .mc/data.db < migrations/001_initial_schema.sql
```

### Q4: 如何查看当前数据库版本？

A: 
```sql
SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 1;
```

---

## 8. 总结

本指南提供了完整的数据库迁移实施步骤，包括：
- 数据库基础设施搭建
- 迁移系统实现
- API 实现
- 前端集成
- 测试计划
- 回滚计划

按照本指南逐步实施，可以确保迁移过程顺利进行。
