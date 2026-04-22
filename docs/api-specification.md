# Task-Session API 规范

## 文档信息
- 创建日期：2026-04-20
- 最后更新：2026-04-22
- 状态：✅ 已实施完成
- 相关文档：[task-session-architecture.md](task-session-architecture.md)

---

## 1. 数据库初始化

### 1.1 initialize_database

**描述**：初始化数据库，创建表结构，运行迁移

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn initialize_database(app_handle: tauri::AppHandle) -> Result<(), String>
```

**前端调用**：
```typescript
await invoke('initialize_database');
```

**返回值**：
- 成功：`null`
- 失败：错误信息字符串

**错误类型**：
- `Failed to create database directory`
- `Failed to open database`
- `Failed to optimize database`
- `Failed to run migrations`
- `Database integrity check failed`

---

## 2. Task 管理

### 2.1 create_task

**描述**：创建 Task 并为所有 Role 创建对应的 Session

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn create_task(
    task: TaskCreateRequest,
    app_handle: tauri::AppHandle,
) -> Result<Task, String>
```

**请求参数**：
```typescript
interface TaskCreateRequest {
  name: string;
  description: string;
  icon: string;
  roles: RoleConfig[];
}

interface RoleConfig {
  name: string;
  identity: string;
  model: string;
  provider: string;
}
```

**响应数据**：
```typescript
interface Task {
  id: string;
  name: string;
  description: string;
  icon: string;
  roles: TaskRole[];
  createdAt: string;
  updatedAt: string;
}

interface TaskRole {
  id: string;
  name: string;
  identity: string;
  model: string;
  provider: string;
  sessionId: string;  // 关联的 Session ID
  createdAt: string;
}
```

**前端调用**：
```typescript
const task = await invoke<Task>('create_task', {
  task: {
    name: 'E-commerce Website',
    description: 'Build an online store',
    icon: '🛒',
    roles: [
      { name: 'Developer', identity: 'bob', model: 'claude-sonnet-4-6', provider: 'anthropic' },
      { name: 'Designer', identity: 'alice', model: 'claude-sonnet-4-6', provider: 'anthropic' },
      { name: 'Reviewer', identity: 'clark', model: 'claude-opus-4-7', provider: 'anthropic' },
    ],
  },
});
```

**错误类型**：
- `Failed to insert task`
- `Failed to insert role`
- `Failed to insert session`
- `Failed to create Claurst session for role {name}`
- `Failed to commit transaction`

**事务保证**：
- 如果任何步骤失败，整个操作回滚
- 已创建的 Claurst Session 会被清理

---

### 2.2 get_task

**描述**：获取单个 Task 的详细信息

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn get_task(
    task_id: String,
    app_handle: tauri::AppHandle,
) -> Result<TaskWithSessions, String>
```

**响应数据**：
```typescript
interface TaskWithSessions {
  id: string;
  name: string;
  description: string;
  icon: string;
  roles: TaskRoleWithSession[];
  createdAt: string;
  updatedAt: string;
}

interface TaskRoleWithSession {
  id: string;
  name: string;
  identity: string;
  model: string;
  provider: string;
  sessionId: string;
  session: Session;  // 包含完整的 Session 信息
  messageCount: number;  // 该 Session 的消息数量
  createdAt: string;
}

interface Session {
  id: string;
  type: 'task';
  name: string;
  model: string;
  provider: string;
  status: 'initializing' | 'ready' | 'error' | 'deleted';
  errorMessage?: string;
  taskId: string;
  roleId: string;
  createdAt: string;
  updatedAt: string;
}
```

**前端调用**：
```typescript
const task = await invoke<TaskWithSessions>('get_task', { taskId: 'task-123' });
```

**错误类型**：
- `Task not found`
- `Failed to query task`

---

### 2.3 list_tasks

**描述**：获取所有 Task 列表

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn list_tasks(
    app_handle: tauri::AppHandle,
) -> Result<Vec<TaskSummary>, String>
```

**响应数据**：
```typescript
interface TaskSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  roleCount: number;
  totalMessages: number;
  createdAt: string;
  updatedAt: string;
}
```

**前端调用**：
```typescript
const tasks = await invoke<TaskSummary[]>('list_tasks');
```

---

### 2.4 update_task

**描述**：更新 Task 的基本信息（不包括 Role）

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn update_task(
    task_id: String,
    updates: TaskUpdateRequest,
    app_handle: tauri::AppHandle,
) -> Result<Task, String>
```

**请求参数**：
```typescript
interface TaskUpdateRequest {
  name?: string;
  description?: string;
  icon?: string;
}
```

**前端调用**：
```typescript
const task = await invoke<Task>('update_task', {
  taskId: 'task-123',
  updates: { name: 'New Task Name' },
});
```

---

### 2.5 delete_task

**描述**：删除 Task 及其所有关联的 Role、Session、Message

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn delete_task(
    task_id: String,
    app_handle: tauri::AppHandle,
) -> Result<DeleteTaskResult, String>
```

**响应数据**：
```typescript
interface DeleteTaskResult {
  deletedTaskId: string;
  deletedRoleCount: number;
  deletedSessionCount: number;
  deletedMessageCount: number;
}
```

**前端调用**：
```typescript
const result = await invoke<DeleteTaskResult>('delete_task', { taskId: 'task-123' });
```

**级联删除**：
- 删除 Task 记录
- 删除所有关联的 Role 记录
- 删除所有关联的 Session 记录（数据库 + Claurst）
- 删除所有关联的 Message 记录

---

## 3. Session 管理

### 3.1 create_normal_session

**描述**：创建普通 Session（非 Task Session）

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn create_normal_session(
    name: String,
    model: String,
    provider: String,
    working_directory: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String>
```

**前端调用**：
```typescript
const sessionId = await invoke<string>('create_normal_session', {
  name: 'My Chat',
  model: 'claude-sonnet-4-6',
  provider: 'anthropic',
  workingDirectory: '/Users/immeta/work/project',
});
```

**返回值**：Session ID

---

### 3.2 get_session

**描述**：获取 Session 详细信息

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn get_session(
    session_id: String,
    app_handle: tauri::AppHandle,
) -> Result<Session, String>
```

**前端调用**：
```typescript
const session = await invoke<Session>('get_session', { sessionId: 'session-123' });
```

---

### 3.3 list_normal_sessions

**描述**：获取所有普通 Session 列表（不包括 Task Session）

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn list_normal_sessions(
    app_handle: tauri::AppHandle,
) -> Result<Vec<SessionSummary>, String>
```

**响应数据**：
```typescript
interface SessionSummary {
  id: string;
  type: 'normal';
  name: string;
  model: string;
  provider: string;
  status: 'ready' | 'error';
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}
```

**前端调用**：
```typescript
const sessions = await invoke<SessionSummary[]>('list_normal_sessions');
```

---

### 3.4 delete_session

**描述**：删除 Session 及其所有消息

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn delete_session(
    session_id: String,
    app_handle: tauri::AppHandle,
) -> Result<DeleteSessionResult, String>
```

**响应数据**：
```typescript
interface DeleteSessionResult {
  deletedSessionId: string;
  deletedMessageCount: number;
}
```

**前端调用**：
```typescript
const result = await invoke<DeleteSessionResult>('delete_session', { sessionId: 'session-123' });
```

**注意**：
- 如果是 Task Session，应该通过删除 Task 来删除
- 此 API 主要用于删除普通 Session

---

## 4. Message 管理

### 4.1 get_messages

**描述**：获取指定 Session 的消息列表

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn get_messages(
    session_id: String,
    limit: Option<u32>,
    offset: Option<u32>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<Message>, String>
```

**请求参数**：
```typescript
interface GetMessagesRequest {
  sessionId: string;
  limit?: number;  // 默认 100
  offset?: number; // 默认 0
}
```

**响应数据**：
```typescript
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

**前端调用**：
```typescript
const messages = await invoke<Message[]>('get_messages', {
  sessionId: 'session-123',
  limit: 50,
  offset: 0,
});
```

---

### 4.2 save_message

**描述**：保存消息到数据库

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn save_message(
    message: MessageCreateRequest,
    app_handle: tauri::AppHandle,
) -> Result<String, String>
```

**请求参数**：
```typescript
interface MessageCreateRequest {
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  requestId?: string;
  isStreaming: boolean;
}
```

**前端调用**：
```typescript
const messageId = await invoke<string>('save_message', {
  message: {
    sessionId: 'session-123',
    role: 'user',
    content: 'Hello, Claude!',
    isStreaming: false,
  },
});
```

**返回值**：Message ID

---

### 4.3 update_message_content

**描述**：更新消息内容（用于流式接收）

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn update_message_content(
    message_id: String,
    content: String,
    is_streaming: bool,
    app_handle: tauri::AppHandle,
) -> Result<(), String>
```

**前端调用**：
```typescript
await invoke('update_message_content', {
  messageId: 'msg-123',
  content: 'Updated content...',
  isStreaming: true,
});
```

---

### 4.4 search_messages

**描述**：全文搜索消息内容

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn search_messages(
    query: String,
    limit: Option<u32>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<MessageSearchResult>, String>
```

**响应数据**：
```typescript
interface MessageSearchResult {
  message: Message;
  sessionName: string;
  sessionType: 'normal' | 'task';
  taskName?: string;
  roleName?: string;
  snippet: string;  // 高亮的摘要
  rank: number;     // 相关性分数
}
```

**前端调用**：
```typescript
const results = await invoke<MessageSearchResult[]>('search_messages', {
  query: '错误 OR 异常',
  limit: 50,
});
```

---

## 5. 消息转发

### 5.1 forward_message

**描述**：转发消息到目标 Session

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn forward_message(
    target_session_id: String,
    message_content: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String>
```

**前端调用**：
```typescript
await invoke('forward_message', {
  targetSessionId: 'task-1-role-2-session',
  messageContent: '[Note]\nPlease review this code\n\n[Forwarded from Developer]\nHere is the implementation...',
});
```

**实现逻辑**：
1. 验证目标 Session 存在且状态为 'ready'
2. 调用 Claurst API 发送消息
3. 保存消息到数据库

---

## 6. 统计分析

### 6.1 get_statistics

**描述**：获取全局统计信息

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn get_statistics(
    app_handle: tauri::AppHandle,
) -> Result<Statistics, String>
```

**响应数据**：
```typescript
interface Statistics {
  totalTasks: number;
  totalSessions: number;
  totalMessages: number;
  normalSessions: number;
  taskSessions: number;
  messagesByDay: DailyMessageCount[];
  topSessions: TopSession[];
}

interface DailyMessageCount {
  date: string;  // YYYY-MM-DD
  count: number;
}

interface TopSession {
  sessionId: string;
  sessionName: string;
  sessionType: 'normal' | 'task';
  messageCount: number;
}
```

**前端调用**：
```typescript
const stats = await invoke<Statistics>('get_statistics');
```

---

### 6.2 get_task_statistics

**描述**：获取指定 Task 的统计信息

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn get_task_statistics(
    task_id: String,
    app_handle: tauri::AppHandle,
) -> Result<TaskStatistics, String>
```

**响应数据**：
```typescript
interface TaskStatistics {
  taskId: string;
  taskName: string;
  totalMessages: number;
  messagesByRole: RoleMessageCount[];
  messagesByDay: DailyMessageCount[];
  createdAt: string;
}

interface RoleMessageCount {
  roleId: string;
  roleName: string;
  messageCount: number;
}
```

**前端调用**：
```typescript
const stats = await invoke<TaskStatistics>('get_task_statistics', { taskId: 'task-123' });
```

---

## 7. 备份与恢复

### 7.1 create_backup

**描述**：创建数据库备份

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn create_backup(
    app_handle: tauri::AppHandle,
) -> Result<BackupInfo, String>
```

**响应数据**：
```typescript
interface BackupInfo {
  backupPath: string;
  backupSize: number;  // bytes
  createdAt: string;
}
```

**前端调用**：
```typescript
const backup = await invoke<BackupInfo>('create_backup');
```

---

### 7.2 list_backups

**描述**：列出所有备份

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn list_backups(
    app_handle: tauri::AppHandle,
) -> Result<Vec<BackupInfo>, String>
```

**前端调用**：
```typescript
const backups = await invoke<BackupInfo[]>('list_backups');
```

---

### 7.3 restore_backup

**描述**：从备份恢复数据库

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn restore_backup(
    backup_path: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String>
```

**前端调用**：
```typescript
await invoke('restore_backup', { backupPath: '.mc/backups/data-2026-04-20.db' });
```

**注意**：
- 恢复前会自动创建当前数据库的备份
- 恢复后会验证数据库完整性

---

## 8. 数据库维护

### 8.1 vacuum_database

**描述**：执行 VACUUM 操作，回收空间并优化数据库

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn vacuum_database(
    app_handle: tauri::AppHandle,
) -> Result<VacuumResult, String>
```

**响应数据**：
```typescript
interface VacuumResult {
  sizeBefore: number;  // bytes
  sizeAfter: number;   // bytes
  spaceReclaimed: number;  // bytes
}
```

**前端调用**：
```typescript
const result = await invoke<VacuumResult>('vacuum_database');
```

---

### 8.2 analyze_database

**描述**：执行 ANALYZE 操作，更新查询优化器统计信息

**Rust 函数签名**：
```rust
#[tauri::command]
pub async fn analyze_database(
    app_handle: tauri::AppHandle,
) -> Result<(), String>
```

**前端调用**：
```typescript
await invoke('analyze_database');
```

---

## 9. 错误码定义

```typescript
enum DatabaseErrorCode {
  CONNECTION_FAILED = 'DB_CONNECTION_FAILED',
  QUERY_FAILED = 'DB_QUERY_FAILED',
  TRANSACTION_FAILED = 'DB_TRANSACTION_FAILED',
  CONSTRAINT_VIOLATION = 'DB_CONSTRAINT_VIOLATION',
  NOT_FOUND = 'DB_NOT_FOUND',
  MIGRATION_FAILED = 'DB_MIGRATION_FAILED',
  CLAURST_API_FAILED = 'CLAURST_API_FAILED',
}
```

**错误响应格式**：
```typescript
interface ErrorResponse {
  code: DatabaseErrorCode;
  message: string;
  details?: any;
}
```

---

## 10. 前端服务层封装示例

```typescript
// src/services/taskService.ts
import { invoke } from '@tauri-apps/api/tauri';

export class TaskService {
  static async createTask(request: TaskCreateRequest): Promise<Task> {
    try {
      return await invoke<Task>('create_task', { task: request });
    } catch (error) {
      throw new Error(`Failed to create task: ${error}`);
    }
  }

  static async getTask(taskId: string): Promise<TaskWithSessions> {
    try {
      return await invoke<TaskWithSessions>('get_task', { taskId });
    } catch (error) {
      throw new Error(`Failed to get task: ${error}`);
    }
  }

  static async listTasks(): Promise<TaskSummary[]> {
    try {
      return await invoke<TaskSummary[]>('list_tasks');
    } catch (error) {
      throw new Error(`Failed to list tasks: ${error}`);
    }
  }

  static async deleteTask(taskId: string): Promise<DeleteTaskResult> {
    try {
      return await invoke<DeleteTaskResult>('delete_task', { taskId });
    } catch (error) {
      throw new Error(`Failed to delete task: ${error}`);
    }
  }
}
```

---

## 11. 实施优先级

### Phase 1: 核心 API（必须）
- initialize_database
- create_task
- get_task
- list_tasks
- delete_task
- get_messages
- save_message
- update_message_content

### Phase 2: Session 管理（必须）
- create_normal_session
- get_session
- list_normal_sessions
- delete_session
- forward_message

### Phase 3: 搜索与统计（重要）
- search_messages
- get_statistics
- get_task_statistics

### Phase 4: 备份与维护（建议）
- create_backup
- list_backups
- restore_backup
- vacuum_database
- analyze_database

---

## 12. 测试用例

每个 API 都应该有对应的测试用例，参考：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_task() {
        // 测试创建 Task
    }

    #[tokio::test]
    async fn test_create_task_rollback_on_failure() {
        // 测试失败时的回滚
    }

    #[tokio::test]
    async fn test_delete_task_cascade() {
        // 测试级联删除
    }
}
```
