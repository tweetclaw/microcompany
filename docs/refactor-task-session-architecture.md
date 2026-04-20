# Task-Session 架构重构方案

## 文档版本
- 创建日期：2026-04-20
- 作者：AI Assistant
- 状态：待审核

## 1. 背景与问题

### 1.1 当前架构问题
1. **Session 创建时机不明确**：Task 的角色对应的 Session 在什么时候创建不清晰
2. **转发消息失败**：当转发消息到目标角色时，如果目标角色还没有创建 Session，转发会失败
3. **Session 管理混乱**：Task 相关的 Session 和普通 Session 混在一起，难以区分和管理
4. **数据关系不清晰**：Task、Role、Session 三者的关系在数据结构中没有明确体现

### 1.2 用户需求
用户希望实现以下架构：
- 创建 Task 时，立即为每个角色创建对应的 Session
- Task Session 不存储在普通 Session 列表中，而是作为 Task 的子项
- Task Session 包含 `taskId` 和 `roleId` 信息，与普通 Session 区分
- UI 上 Task 列表可以展开，显示其下属的角色对应的 Session

## 2. 新架构设计

### 2.1 核心概念

#### 2.1.1 Session 类型划分
```typescript
// Session 基础类型
interface BaseSession {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  provider: string;
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

#### 2.1.2 Task 数据结构调整
```typescript
interface TaskRole {
  id: string;
  name: string;
  identity: string;
  model: string;
  provider: string;
  sessionId: string;   // 关联的 Session ID（创建 Task 时立即生成）
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
```

### 2.2 存储结构

#### 2.2.1 文件系统结构
```
.claude/
├── sessions/              # 普通 Session 存储目录
│   ├── session-1.json
│   ├── session-2.json
│   └── ...
├── tasks/                 # Task 存储目录
│   ├── task-1.json       # Task 元数据
│   ├── task-2.json
│   └── ...
└── task-sessions/         # Task Session 存储目录（新增）
    ├── task-1/
    │   ├── role-1-session.json
    │   ├── role-2-session.json
    │   └── role-3-session.json
    ├── task-2/
    │   └── ...
    └── ...
```

#### 2.2.2 Session 文件格式
```json
// 普通 Session: .claude/sessions/session-1.json
{
  "id": "session-1",
  "type": "normal",
  "name": "My Chat Session",
  "createdAt": "2026-04-20T10:00:00Z",
  "updatedAt": "2026-04-20T10:30:00Z",
  "model": "claude-sonnet-4-6",
  "provider": "anthropic"
}

// Task Session: .claude/task-sessions/task-1/role-1-session.json
{
  "id": "task-1-role-1-session",
  "type": "task",
  "taskId": "task-1",
  "roleId": "role-1",
  "name": "Developer Session",
  "createdAt": "2026-04-20T10:00:00Z",
  "updatedAt": "2026-04-20T10:30:00Z",
  "model": "claude-sonnet-4-6",
  "provider": "anthropic"
}
```

### 2.3 生命周期管理

#### 2.3.1 Task 创建流程
```
1. 用户创建 Task
   ↓
2. 保存 Task 元数据到 .claude/tasks/task-{id}.json
   ↓
3. 为每个 Role 创建对应的 Session
   - 生成 Session ID: task-{taskId}-role-{roleId}-session
   - 创建 Session 文件到 .claude/task-sessions/{taskId}/
   - 调用后端 API 创建 Claurst Session
   ↓
4. 更新 Task 中每个 Role 的 sessionId 字段
   ↓
5. 保存更新后的 Task 元数据
```

#### 2.3.2 Task 删除流程
```
1. 用户删除 Task
   ↓
2. 读取 Task 元数据，获取所有 Role 的 sessionId
   ↓
3. 删除所有关联的 Task Session
   - 调用后端 API 删除 Claurst Session
   - 删除 .claude/task-sessions/{taskId}/ 目录
   ↓
4. 删除 Task 元数据文件
   ↓
5. 刷新 UI
```

#### 2.3.3 消息转发流程
```
1. 用户点击 "Forward Latest Reply"
   ↓
2. 显示转发弹窗，列出其他角色
   ↓
3. 用户选择目标角色并添加备注
   ↓
4. 从 Task 中获取目标角色的 sessionId（保证存在）
   ↓
5. 调用后端 API 转发消息到目标 Session
   ↓
6. 显示成功提示，关闭弹窗
```

## 3. 实现计划

### 3.1 后端 API 变更

#### 3.1.1 新增 API
```rust
// 批量创建 Task Sessions
#[tauri::command]
async fn create_task_sessions(
    task_id: String,
    roles: Vec<TaskRoleConfig>,
    working_directory: String,
) -> Result<Vec<String>, String>

// 批量删除 Task Sessions
#[tauri::command]
async fn delete_task_sessions(
    session_ids: Vec<String>,
) -> Result<(), String>
```

#### 3.1.2 修改现有 API
```rust
// create_session 添加 session_type 参数
#[tauri::command]
async fn create_session(
    name: String,
    model: String,
    provider: String,
    working_directory: String,
    session_type: Option<String>,  // "normal" | "task"
    task_id: Option<String>,
    role_id: Option<String>,
) -> Result<String, String>
```

### 3.2 前端组件变更

#### 3.2.1 新增/修改的文件
```
src/
├── types/
│   └── index.ts                    # 修改：添加 Session 类型定义
├── services/
│   ├── sessionService.ts           # 新增：Session 管理服务
│   └── taskService.ts              # 修改：添加 Task Session 创建逻辑
├── components/
│   ├── TaskBuilder.tsx             # 修改：创建 Task 时同时创建 Sessions
│   ├── TaskListPanel.tsx           # 修改：支持展开显示 Role Sessions
│   └── ForwardLatestReplyModal.tsx # 修改：已修复 isForwarding 状态问题
└── App.tsx                         # 修改：Session 加载逻辑区分类型
```

#### 3.2.2 UI 变更
1. **TaskListPanel 组件**
   - 添加展开/折叠功能
   - 显示 Task 下的所有 Role Sessions
   - 点击 Role Session 可以切换到对应的会话

2. **SessionList 组件**
   - 只显示 `type: 'normal'` 的 Session
   - 不显示 Task Session

3. **TaskBuilder 组件**
   - 创建 Task 时显示 "Creating sessions..." 加载状态
   - 创建失败时提供重试机制

### 3.3 数据迁移

#### 3.3.1 迁移策略
对于已存在的 Task：
1. 检查每个 Task 的 Role 是否有 sessionId
2. 如果没有，为该 Role 创建 Session
3. 更新 Task 元数据
4. 将现有的 Session 标记为 `type: 'normal'`

#### 3.3.2 迁移脚本
```typescript
// src/utils/migration.ts
async function migrateTaskSessions() {
  const tasks = await loadAllTasks();
  
  for (const task of tasks) {
    let needsUpdate = false;
    
    for (const role of task.roles) {
      if (!role.sessionId) {
        // 创建 Session
        const sessionId = await createTaskSession(task.id, role);
        role.sessionId = sessionId;
        needsUpdate = true;
      }
    }
    
    if (needsUpdate) {
      await saveTask(task);
    }
  }
}
```

## 4. 实现步骤

### Phase 1: 类型定义和数据结构（1-2 小时）
- [ ] 更新 TypeScript 类型定义
- [ ] 创建 Session 服务层
- [ ] 添加数据验证逻辑

### Phase 2: 后端 API 实现（2-3 小时）
- [ ] 实现 `create_task_sessions` API
- [ ] 实现 `delete_task_sessions` API
- [ ] 修改 `create_session` API 支持 session_type
- [ ] 添加单元测试

### Phase 3: Task 创建流程（2-3 小时）
- [ ] 修改 TaskBuilder 组件
- [ ] 实现 Task Session 批量创建逻辑
- [ ] 添加错误处理和重试机制
- [ ] 更新 UI 加载状态

### Phase 4: Task 删除流程（1-2 小时）
- [ ] 修改 Task 删除逻辑
- [ ] 实现级联删除 Task Sessions
- [ ] 添加确认对话框

### Phase 5: UI 展示优化（2-3 小时）
- [ ] TaskListPanel 添加展开/折叠功能
- [ ] 显示 Role Sessions 列表
- [ ] SessionList 过滤 Task Sessions
- [ ] 添加视觉区分（图标、颜色）

### Phase 6: 数据迁移（1-2 小时）
- [ ] 编写迁移脚本
- [ ] 测试迁移逻辑
- [ ] 添加迁移日志

### Phase 7: 测试和优化（2-3 小时）
- [ ] 端到端测试
- [ ] 性能优化
- [ ] 错误处理完善
- [ ] 文档更新

**总计：11-18 小时**

## 5. 风险和注意事项

### 5.1 技术风险
1. **并发创建 Session**：创建 Task 时需要为多个 Role 创建 Session，可能耗时较长
   - 缓解措施：使用 Promise.all 并发创建，添加超时处理

2. **Session ID 冲突**：Task Session ID 生成规则需要保证唯一性
   - 缓解措施：使用 `task-{taskId}-role-{roleId}-session-{timestamp}` 格式

3. **数据一致性**：Task 和 Session 的关联关系需要保持一致
   - 缓解措施：使用事务性操作，失败时回滚

### 5.2 用户体验风险
1. **创建 Task 变慢**：需要创建多个 Session，用户等待时间增加
   - 缓解措施：显示进度条，提供后台创建选项

2. **数据迁移**：现有用户的 Task 需要迁移
   - 缓解措施：首次启动时自动迁移，提供迁移进度提示

### 5.3 兼容性风险
1. **旧版本数据**：需要兼容没有 sessionId 的 Task
   - 缓解措施：运行时检查并自动创建缺失的 Session

## 6. 成功标准

### 6.1 功能标准
- [ ] 创建 Task 时自动为所有 Role 创建 Session
- [ ] Task Session 和普通 Session 在存储和 UI 上完全隔离
- [ ] 转发消息功能正常工作，不再出现 "session not found" 错误
- [ ] 删除 Task 时自动清理所有关联的 Session
- [ ] TaskListPanel 可以展开显示 Role Sessions

### 6.2 性能标准
- [ ] 创建包含 3 个 Role 的 Task 在 3 秒内完成
- [ ] 删除 Task 在 2 秒内完成
- [ ] Session 列表加载时间不受 Task Session 数量影响

### 6.3 质量标准
- [ ] 所有新增代码有单元测试覆盖
- [ ] 端到端测试通过
- [ ] 无内存泄漏
- [ ] 错误处理完善，用户友好的错误提示

## 7. 后续优化方向

1. **Session 预热**：Task 创建后，预先加载 Session 的初始上下文
2. **批量操作**：支持批量创建/删除 Task
3. **Session 模板**：为常见的 Role 类型提供 Session 模板
4. **性能监控**：添加 Session 创建/删除的性能监控
5. **离线支持**：支持离线创建 Task，在线时同步 Session

## 8. 附录

### 8.1 相关文件清单
```
后端文件：
- src-tauri/src/session.rs
- src-tauri/src/task.rs

前端文件：
- src/types/index.ts
- src/services/sessionService.ts
- src/services/taskService.ts
- src/components/TaskBuilder.tsx
- src/components/TaskListPanel.tsx
- src/components/ForwardLatestReplyModal.tsx
- src/App.tsx

测试文件：
- src/services/__tests__/sessionService.test.ts
- src/services/__tests__/taskService.test.ts
- src/components/__tests__/TaskBuilder.test.tsx
```

### 8.2 API 接口文档
详见 `docs/api/task-session-api.md`（待创建）

### 8.3 数据库 Schema
详见 `docs/schema/task-session-schema.md`（待创建）
