# 多 Agent 协作编排系统 - 技术方案

## 1. 架构设计

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Team Config  │  │ Chat UI      │  │ Workflow     │      │
│  │ Panel        │  │ (Master)     │  │ Visualizer   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────────────────────────────────────────┐      │
│  │         Sub-Session Status Panel                  │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↕ Tauri IPC
┌─────────────────────────────────────────────────────────────┐
│                      Backend (Rust)                          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐      │
│  │           Orchestration Engine                    │      │
│  │  ┌────────────────┐  ┌────────────────┐         │      │
│  │  │ Master Session │  │ Message Router │         │      │
│  │  │   Manager      │  │                │         │      │
│  │  └────────────────┘  └────────────────┘         │      │
│  │  ┌────────────────┐  ┌────────────────┐         │      │
│  │  │ Sub-Session    │  │ Workflow       │         │      │
│  │  │   Pool         │  │   Executor     │         │      │
│  │  └────────────────┘  └────────────────┘         │      │
│  └──────────────────────────────────────────────────┘      │
│  ┌──────────────────────────────────────────────────┐      │
│  │              Storage Layer                        │      │
│  │  - Team Configs                                   │      │
│  │  - Session Hierarchy                              │      │
│  │  - Message History                                │      │
│  │  - Workflow Templates                             │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                   Claurst (AI Backend)                       │
│  - Multiple ClaurstSession instances                         │
│  - Independent context per session                           │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心模块

#### 1.2.1 Team Configuration Module (团队配置模块)

**数据结构**：

```rust
// src-tauri/src/team/mod.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub roles: Vec<RoleConfig>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoleConfig {
    pub id: String,              // 如 "pm", "developer", "reviewer"
    pub name: String,            // 如 "Alice", "Bob", "Clark"
    pub role_type: RoleType,     // PM, Developer, Reviewer, Tester
    pub provider_id: String,     // 使用的 Provider
    pub model: String,           // 使用的模型
    pub system_prompt: String,   // 角色的 System Prompt
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RoleType {
    ProjectManager,
    Developer,
    Reviewer,
    Tester,
    Custom(String),
}
```

**存储位置**：
- `~/.microcompany/teams/{team_id}.json`

#### 1.2.2 Session Hierarchy Module (Session 层级模块)

**数据结构**：

```rust
// src-tauri/src/orchestration/session.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MasterSession {
    pub session_id: String,
    pub working_directory: String,
    pub team_config_id: String,
    pub pm_role_id: String,           // 主 Session 对应的角色 ID
    pub sub_sessions: HashMap<String, SubSessionInfo>,
    pub message_history: Vec<MessageRecord>,
    pub workflow_state: WorkflowState,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubSessionInfo {
    pub sub_session_id: String,
    pub role_id: String,
    pub role_name: String,
    pub status: SubSessionStatus,
    pub assigned_task: Option<String>,
    pub result: Option<String>,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SubSessionStatus {
    Idle,           // 空闲
    Assigned,       // 已分配任务
    Running,        // 执行中
    Completed,      // 已完成
    Failed,         // 失败
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageRecord {
    pub id: String,
    pub from: MessageSource,
    pub to: MessageTarget,
    pub content: String,
    pub timestamp: i64,
    pub message_type: MessageType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessageSource {
    User,
    MasterSession,
    SubSession(String),  // sub_session_id
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessageTarget {
    MasterSession,
    SubSession(String),  // sub_session_id
    User,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessageType {
    UserInput,
    TaskAssignment,
    TaskResult,
    Forwarded,
}
```

#### 1.2.3 Orchestration Engine (编排引擎)

**核心组件**：

```rust
// src-tauri/src/orchestration/engine.rs

pub struct OrchestrationEngine {
    master_session: Arc<Mutex<Option<MasterSession>>>,
    sub_session_pool: Arc<Mutex<HashMap<String, ClaurstSession>>>,
    message_router: Arc<MessageRouter>,
    workflow_executor: Arc<WorkflowExecutor>,
    storage: Arc<OrchestrationStorage>,
}

impl OrchestrationEngine {
    // 初始化主 Session
    pub async fn init_master_session(
        &self,
        working_dir: String,
        team_config_id: String,
    ) -> Result<String, String>;
    
    // 创建子 Session
    pub async fn create_sub_session(
        &self,
        role_id: String,
    ) -> Result<String, String>;
    
    // 发送消息（路由）
    pub async fn send_message(
        &self,
        from: MessageSource,
        to: MessageTarget,
        content: String,
    ) -> Result<(), String>;
    
    // 分配任务给子 Session
    pub async fn assign_task(
        &self,
        sub_session_id: String,
        task_description: String,
        context: Option<String>,
    ) -> Result<(), String>;
    
    // 获取子 Session 结果
    pub async fn get_sub_session_result(
        &self,
        sub_session_id: String,
    ) -> Result<Option<String>, String>;
}
```

#### 1.2.4 Message Router (消息路由)

```rust
// src-tauri/src/orchestration/router.rs

pub struct MessageRouter {
    routing_table: Arc<Mutex<HashMap<String, MessageTarget>>>,
}

impl MessageRouter {
    // 路由消息
    pub async fn route_message(
        &self,
        message: MessageRecord,
        engine: &OrchestrationEngine,
    ) -> Result<(), String>;
    
    // 注册路由规则
    pub fn register_route(
        &self,
        from: String,
        to: MessageTarget,
    );
}
```

#### 1.2.5 Workflow Executor (工作流执行器)

```rust
// src-tauri/src/orchestration/workflow.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowState {
    pub current_step: usize,
    pub steps: Vec<WorkflowStep>,
    pub status: WorkflowStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStep {
    pub id: String,
    pub step_type: StepType,
    pub role_id: Option<String>,
    pub description: String,
    pub status: StepStatus,
    pub result: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StepType {
    Sequential,      // 串行执行
    Parallel,        // 并行执行
    Conditional,     // 条件分支
    Loop,            // 循环
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StepStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WorkflowStatus {
    NotStarted,
    Running,
    Completed,
    Failed,
    Paused,
}

pub struct WorkflowExecutor {
    engine: Arc<OrchestrationEngine>,
}

impl WorkflowExecutor {
    // 执行工作流
    pub async fn execute_workflow(
        &self,
        workflow: &mut WorkflowState,
    ) -> Result<(), String>;
    
    // 执行单个步骤
    async fn execute_step(
        &self,
        step: &mut WorkflowStep,
    ) -> Result<(), String>;
}
```

### 1.3 存储设计

#### 1.3.1 数据库 Schema

```sql
-- 团队配置表
CREATE TABLE teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    config_json TEXT NOT NULL,  -- JSON 序列化的 TeamConfig
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 主 Session 表
CREATE TABLE master_sessions (
    session_id TEXT PRIMARY KEY,
    working_directory TEXT NOT NULL,
    team_config_id TEXT NOT NULL,
    pm_role_id TEXT NOT NULL,
    workflow_state_json TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (team_config_id) REFERENCES teams(id)
);

-- 子 Session 表
CREATE TABLE sub_sessions (
    sub_session_id TEXT PRIMARY KEY,
    master_session_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    role_name TEXT NOT NULL,
    status TEXT NOT NULL,
    assigned_task TEXT,
    result TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (master_session_id) REFERENCES master_sessions(session_id)
);

-- 消息记录表
CREATE TABLE message_records (
    id TEXT PRIMARY KEY,
    master_session_id TEXT NOT NULL,
    from_source TEXT NOT NULL,
    to_target TEXT NOT NULL,
    content TEXT NOT NULL,
    message_type TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (master_session_id) REFERENCES master_sessions(session_id)
);
```

## 2. 实现路线图

### Phase 1: 基础架构（2-3 周）

**目标**：建立团队配置系统和基础 Session 管理

**任务**：
1. 创建 `team` 模块，实现团队配置的 CRUD
2. 扩展 `storage` 模块，支持新的数据表
3. 实现 `OrchestrationEngine` 基础框架
4. 前端：团队配置 UI（添加/编辑/删除角色）

**交付物**：
- 用户可以创建和配置一个团队
- 团队配置可以持久化存储

### Phase 2: Session 层级与消息路由（3-4 周）

**目标**：实现主 Session 和子 Session 的创建与通信

**任务**：
1. 实现 `MasterSession` 和 `SubSessionInfo` 管理
2. 实现 `MessageRouter` 消息路由逻辑
3. 扩展 `ClaurstSession` 支持多实例并发
4. 实现子 Session 的创建、任务分配、结果获取
5. 前端：子 Session 状态面板

**交付物**：
- 主 Session 可以创建子 Session
- 消息可以在主/子 Session 之间路由
- 前端可以看到子 Session 的状态

### Phase 3: 简单工作流编排（2-3 周）

**目标**：实现串行工作流执行

**任务**：
1. 实现 `WorkflowExecutor` 基础逻辑
2. 支持串行步骤执行（Sequential）
3. 实现工作流状态持久化
4. 前端：工作流可视化（简单列表）

**交付物**：
- 用户可以定义一个简单的串行工作流
- 系统自动按顺序执行各个步骤
- 前端显示工作流进度

### Phase 4: 复杂工作流（3-4 周）

**目标**：支持并行、条件、循环

**任务**：
1. 实现并行执行（Parallel）
2. 实现条件分支（Conditional）
3. 实现循环迭代（Loop）
4. 前端：工作流可视化（流程图）

**交付物**：
- 支持复杂的工作流编排
- 前端以流程图形式展示工作流

### Phase 5: 工作流模板与优化（2-3 周）

**目标**：提供预设模板和性能优化

**任务**：
1. 实现工作流模板系统
2. 提供预设模板（标准开发流程、快速原型流程等）
3. 性能优化（并发控制、上下文压缩）
4. 错误处理与重试机制

**交付物**：
- 用户可以选择预设模板快速开始
- 系统稳定性和性能达到生产级别

## 3. 关键技术挑战与解决方案

### 3.1 多 ClaurstSession 并发管理

**挑战**：当前 `AppState` 只支持单个 `ClaurstSession`

**解决方案**：
```rust
pub struct AppState {
    pub master_session: Arc<Mutex<Option<ClaurstSession>>>,
    pub sub_sessions: Arc<Mutex<HashMap<String, ClaurstSession>>>,
    pub orchestration_engine: Arc<Mutex<OrchestrationEngine>>,
    // ... 其他字段
}
```

### 3.2 上下文传递与压缩

**挑战**：子 Session 需要主 Session 的上下文，但不能传递过多信息

**解决方案**：
- 主 Session 在分配任务时，提取关键上下文（用户需求摘要、相关代码片段）
- 子 Session 完成任务时，返回结果摘要而非完整对话历史
- 实现上下文压缩算法（提取关键信息）

### 3.3 消息顺序与一致性

**挑战**：并行执行时，消息可能乱序

**解决方案**：
- 每条消息携带时间戳和序列号
- `MessageRouter` 维护消息队列，保证顺序处理
- 使用 `tokio::sync::mpsc` 实现异步消息队列

### 3.4 工作流状态持久化

**挑战**：工作流执行过程中可能中断，需要支持恢复

**解决方案**：
- 每个步骤完成后立即持久化状态
- 重启后可以从上次中断的步骤继续执行
- 实现工作流快照机制

### 3.5 向后兼容

**挑战**：不能破坏现有的单 Session 使用模式

**解决方案**：
- 保留现有的 `init_session` 和 `send_message` 命令
- 新增 `init_master_session` 和 `send_orchestrated_message` 命令
- 前端根据 Session 类型（单 Session vs 主 Session）切换 UI

## 4. API 设计

### 4.1 Tauri Commands

```rust
// 团队配置相关
#[tauri::command]
async fn create_team(config: TeamConfig) -> Result<String, String>;

#[tauri::command]
async fn update_team(team_id: String, config: TeamConfig) -> Result<(), String>;

#[tauri::command]
async fn delete_team(team_id: String) -> Result<(), String>;

#[tauri::command]
async fn list_teams() -> Result<Vec<TeamConfig>, String>;

// 主 Session 相关
#[tauri::command]
async fn init_master_session(
    working_dir: String,
    team_config_id: String,
) -> Result<String, String>;

#[tauri::command]
async fn send_orchestrated_message(
    message: String,
) -> Result<(), String>;

// 子 Session 相关
#[tauri::command]
async fn list_sub_sessions(
    master_session_id: String,
) -> Result<Vec<SubSessionInfo>, String>;

#[tauri::command]
async fn get_sub_session_messages(
    sub_session_id: String,
) -> Result<Vec<MessageRecord>, String>;

// 工作流相关
#[tauri::command]
async fn get_workflow_state(
    master_session_id: String,
) -> Result<WorkflowState, String>;

#[tauri::command]
async fn pause_workflow() -> Result<(), String>;

#[tauri::command]
async fn resume_workflow() -> Result<(), String>;
```

### 4.2 Frontend Events

```typescript
// 子 Session 状态更新
interface SubSessionStatusEvent {
  sub_session_id: string;
  status: SubSessionStatus;
  role_name: string;
}

// 工作流步骤更新
interface WorkflowStepEvent {
  step_id: string;
  status: StepStatus;
  description: string;
}

// 消息路由事件
interface MessageRoutedEvent {
  from: string;
  to: string;
  content: string;
  timestamp: number;
}
```

## 5. 前端 UI 设计

### 5.1 团队配置界面

```
┌─────────────────────────────────────────────┐
│  Team Configuration                          │
├─────────────────────────────────────────────┤
│  Team Name: [Standard Dev Team        ]     │
│  Description: [A standard software...  ]     │
│                                              │
│  Roles:                                      │
│  ┌────────────────────────────────────────┐ │
│  │ ✓ Alice (Project Manager)             │ │
│  │   Provider: Claude · Model: Opus 4.7  │ │
│  │   [Edit] [Remove]                     │ │
│  ├────────────────────────────────────────┤ │
│  │ ✓ Bob (Developer)                     │ │
│  │   Provider: Claude · Model: Sonnet 4.6│ │
│  │   [Edit] [Remove]                     │ │
│  ├────────────────────────────────────────┤ │
│  │ ✓ Clark (Reviewer)                    │ │
│  │   Provider: OpenAI · Model: GPT-4     │ │
│  │   [Edit] [Remove]                     │ │
│  └────────────────────────────────────────┘ │
│  [+ Add Role]                                │
│                                              │
│  [Save Team] [Cancel]                        │
└─────────────────────────────────────────────┘
```

### 5.2 主对话界面（增强版）

```
┌─────────────────────────────────────────────────────────────┐
│  Sessions  │  Chat (Alice - PM)  │  Sub-Tasks  │  Workflow  │
├────────────┼─────────────────────┼─────────────┼────────────┤
│            │                     │             │            │
│  Session 1 │  User: 实现登录功能  │  Bob        │  ① 需求分析│
│  Session 2 │  Alice: 好的，我来   │  Status: ✓  │  ② 开发计划│
│            │  分析需求...         │  Task: 编写  │  ③ 代码实现│
│            │                     │  开发计划    │  ④ 代码评审│
│            │  Alice: Bob 已完成   │             │  ⑤ 测试验证│
│            │  开发计划，现在让    │  Clark      │            │
│            │  Clark 评审...       │  Status: ⏳ │            │
│            │                     │  Task: 评审  │            │
│            │                     │  开发计划    │            │
│            │                     │             │            │
│            ├─────────────────────┤             │            │
│            │ [Input Box]         │             │            │
└────────────┴─────────────────────┴─────────────┴────────────┘
```

## 6. 测试策略

### 6.1 单元测试
- 测试 `TeamConfig` 的序列化/反序列化
- 测试 `MessageRouter` 的路由逻辑
- 测试 `WorkflowExecutor` 的步骤执行

### 6.2 集成测试
- 测试主 Session 创建子 Session
- 测试消息在主/子 Session 之间的传递
- 测试工作流的完整执行流程

### 6.3 端到端测试
- 模拟用户配置团队
- 模拟用户发起开发任务
- 验证整个工作流自动执行并返回结果

## 7. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 多 Session 并发导致性能问题 | 高 | 限制并发数量，实现资源池 |
| 上下文传递导致 Token 消耗过大 | 中 | 实现上下文压缩算法 |
| 工作流执行失败无法恢复 | 高 | 实现状态持久化和恢复机制 |
| 向后兼容性破坏 | 高 | 保留旧 API，新增新 API |
| UI 复杂度过高 | 中 | 分阶段实现，先简单后复杂 |

## 8. 总结

本技术方案基于当前的 Tauri + Rust + React 架构，通过引入编排引擎、消息路由、工作流执行器等核心模块，实现多 Agent 协作编排系统。方案分 5 个阶段实施，预计总工期 12-17 周。

核心优势：
- 向后兼容，不破坏现有功能
- 模块化设计，易于扩展
- 支持复杂工作流编排
- 完整的状态持久化和恢复机制
