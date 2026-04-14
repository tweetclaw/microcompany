# Claurst 架构分析

**文档版本**: 1.0  
**分析日期**: 2026-04-14  
**Claurst 版本**: 0.0.9

---

## 一、项目概述

Claurst 是 Claude Code 的 Rust 实现，是一个完整的终端编程助手，提供了：
- 多 AI 提供商支持（Anthropic、OpenAI、Google、GitHub Copilot 等 30+ 提供商）
- 完整的工具系统（文件读写、命令执行、代码搜索等）
- 工作目录上下文感知
- 流式响应和多轮对话
- TUI 界面和权限管理

**项目位置**: `/Users/immeta/work/microcompany/claurst`（作为 git submodule）

---

## 二、Crate 架构

Claurst 采用模块化的 crate 架构，位于 `src-rust/crates/` 目录：

### 2.1 核心 Crates

#### `claurst-core`
**职责**: 核心类型、配置、错误处理、会话存储

**关键模块**:
- `types.rs` - 消息、内容块、工具定义等核心类型
- `config.rs` - 配置系统（Settings、Config、AgentDefinition）
- `error.rs` - 统一错误类型 `ClaudeError`
- `session_storage.rs` - JSONL 格式的会话持久化
- `permissions.rs` - 权限管理系统
- `cost.rs` - 成本追踪
- `system_prompt.rs` - 系统提示词生成

**关键类型**:
```rust
pub struct Config {
    pub model: String,
    pub max_tokens: u32,
    pub project_dir: Option<PathBuf>,
    pub permission_mode: PermissionMode,
    pub managed_agents: Option<ManagedAgentConfig>,
    // ...
}

pub struct Settings {
    pub anthropic_api_key: Option<String>,
    pub provider: Option<String>,
    pub base_url: Option<String>,
    // ...
}
```

#### `claurst-api`
**职责**: AI 提供商 API 集成

**关键模块**:
- `lib.rs` - API 客户端核心
- `registry.rs` - 提供商注册表
- `model_registry.rs` - 模型注册表
- `providers/` - 各提供商实现（Anthropic、OpenAI、Google 等）
- `stream_parser.rs` - 流式响应解析

**关键类型**:
```rust
pub struct CreateMessageRequest {
    pub model: String,
    pub max_tokens: u32,
    pub messages: Vec<ApiMessage>,
    pub system: Option<SystemPrompt>,
    pub tools: Option<Vec<ApiToolDefinition>>,
    pub stream: bool,
    // ...
}

pub trait LlmProvider {
    async fn create_message(&self, request: CreateMessageRequest) -> Result<Message>;
    async fn create_message_stream(&self, request: CreateMessageRequest) -> Result<Stream>;
}
```

#### `claurst-tools`
**职责**: 所有工具实现

**核心工具**:
- `file_read.rs` - 读取文件（支持行范围、图片、PDF）
- `file_edit.rs` - 精确字符串替换编辑
- `file_write.rs` - 创建新文件
- `bash.rs` - 执行 shell 命令（持久化 cwd 和 env）
- `glob_tool.rs` - 文件模式匹配搜索
- `grep_tool.rs` - 内容搜索
- `agent_tool.rs` - 子 Agent 调用

**工具接口**:
```rust
#[async_trait]
pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn permission_level(&self) -> PermissionLevel;
    fn input_schema(&self) -> Value;
    async fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult;
}

pub struct ToolContext {
    pub working_dir: PathBuf,
    pub session_id: String,
    pub permission_handler: Arc<dyn PermissionHandler>,
    pub cost_tracker: Arc<CostTracker>,
    // ...
}
```

#### `claurst-query`
**职责**: 核心对话循环

**关键模块**:
- `lib.rs` - 主查询循环 `run_query_loop()`
- `agent_tool.rs` - Agent 工具实现
- `compact.rs` - 上下文压缩
- `managed_orchestrator.rs` - Manager-Executor 架构

**核心流程**:
```rust
pub async fn run_query_loop(
    config: QueryConfig,
    messages: Vec<Message>,
    tools: Vec<Box<dyn Tool>>,
    ctx: ToolContext,
) -> QueryOutcome {
    // 1. 构建 API 请求
    // 2. 发送到 AI 提供商
    // 3. 处理流式响应
    // 4. 检测工具调用
    // 5. 执行工具
    // 6. 将结果反馈给 AI
    // 7. 重复直到 end_turn 或达到限制
}
```

#### `claurst-cli`
**职责**: CLI 入口和 TUI

**关键功能**:
- 命令行参数解析
- TUI 界面（基于 ratatui）
- 会话管理
- 用户输入处理

---

## 三、核心工作流程

### 3.1 会话初始化

```
用户启动 Claurst
    ↓
加载配置 (~/.claurst/settings.json)
    ↓
选择工作目录
    ↓
创建 ToolContext
    ↓
注册工具（Read, Edit, Bash, Glob, Grep 等）
    ↓
初始化 QueryConfig
    ↓
准备就绪，等待用户输入
```

### 3.2 消息处理流程

```
用户发送消息
    ↓
构建 CreateMessageRequest
    ├─ messages: 对话历史
    ├─ system: 系统提示词（包含工作目录上下文）
    ├─ tools: 工具定义列表
    └─ stream: true
    ↓
发送到 AI 提供商 API
    ↓
接收流式响应
    ├─ content_block_delta → 显示文本
    ├─ tool_use → 检测工具调用
    └─ message_stop → 结束
    ↓
如果有工具调用
    ├─ 检查权限
    ├─ 执行工具
    ├─ 收集结果
    └─ 将结果添加到消息历史
    ↓
继续查询循环（直到 end_turn）
```

### 3.3 工具执行流程

```
AI 请求工具调用
    ↓
解析工具名称和参数
    ↓
查找对应的 Tool 实现
    ↓
检查权限级别
    ├─ None/ReadOnly → 自动允许
    ├─ Write/Execute → 根据 PermissionMode
    └─ Forbidden → 拒绝
    ↓
执行 tool.execute(input, ctx)
    ↓
返回 ToolResult
    ├─ success → 正常结果
    └─ error → 错误信息
    ↓
将结果格式化为 ToolResultContent
    ↓
添加到消息历史
```

---

## 四、关键设计模式

### 4.1 工具系统

**特点**:
- 基于 trait 的插件架构
- 统一的权限检查
- 上下文传递（工作目录、会话 ID、权限处理器）
- 结果元数据支持

**示例 - FileEditTool**:
```rust
impl Tool for FileEditTool {
    fn name(&self) -> &str { "Edit" }
    
    fn permission_level(&self) -> PermissionLevel {
        PermissionLevel::Write
    }
    
    async fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult {
        // 1. 解析参数
        // 2. 解析路径（相对于工作目录）
        // 3. 检查权限
        // 4. 读取文件
        // 5. 执行替换
        // 6. 写回文件
        // 7. 记录快照（用于 undo）
        // 8. 返回结果
    }
}
```

### 4.2 持久化 Shell 状态

**问题**: 每次 Bash 工具调用都是独立的进程，无法保持 `cd` 和 `export` 的效果。

**解决方案**:
1. 维护全局的 `ShellState` 注册表（按 session_id 索引）
2. 每次执行命令时，生成包装脚本：
   ```bash
   cd <saved_cwd>
   export VAR1=value1
   export VAR2=value2
   <user_command>
   echo '__CC_SHELL_STATE__'
   pwd
   env
   ```
3. 解析输出，提取新的 cwd 和 env
4. 更新 ShellState

**效果**: 用户感觉像在同一个 shell 会话中工作。

### 4.3 流式响应处理

**实现**:
```rust
pub struct StreamAccumulator {
    pub text: String,
    pub tool_uses: Vec<ToolUse>,
    pub usage: Option<UsageInfo>,
}

// 处理流式事件
match event {
    AnthropicStreamEvent::ContentBlockDelta { delta, .. } => {
        match delta {
            ContentBlockDelta::TextDelta { text } => {
                accumulator.text.push_str(&text);
                // 发送到 UI 显示
            }
            ContentBlockDelta::InputJsonDelta { partial_json } => {
                // 累积工具调用参数
            }
        }
    }
    AnthropicStreamEvent::MessageStop => {
        // 完成
    }
}
```

### 4.4 权限管理

**权限级别**:
```rust
pub enum PermissionLevel {
    None,        // 无需权限
    ReadOnly,    // 只读
    Write,       // 写入
    Execute,     // 执行命令
    Dangerous,   // 危险操作
    Forbidden,   // 禁止
}
```

**权限模式**:
```rust
pub enum PermissionMode {
    Auto,        // 自动允许所有
    Interactive, // 每次询问
    Restricted,  // 只允许只读
}
```

**检查流程**:
```rust
impl ToolContext {
    pub fn check_permission(&self, tool: &str, action: &str, dangerous: bool) -> Result<()> {
        let request = PermissionRequest {
            tool_name: tool.to_string(),
            action: action.to_string(),
            level: if dangerous { PermissionLevel::Dangerous } else { PermissionLevel::Write },
        };
        
        match self.permission_handler.check(&request) {
            PermissionDecision::Allow => Ok(()),
            PermissionDecision::Deny => Err(ClaudeError::PermissionDenied(...)),
            PermissionDecision::Ask => {
                // 提示用户
            }
        }
    }
}
```

---

## 五、配置系统

### 5.1 配置文件位置

- **Settings**: `~/.claurst/settings.json`
- **Auth**: `~/.claurst/auth.json`
- **会话**: `~/.claurst/sessions/<session_id>.jsonl`

### 5.2 Settings 结构

```json
{
  "anthropic_api_key": "sk-ant-...",
  "provider": "anthropic",
  "base_url": "https://api.anthropic.com",
  "model": "claude-sonnet-4-6",
  "max_tokens": 8192,
  "permission_mode": "auto",
  "managed_agents": {
    "enabled": false,
    "manager_model": "anthropic/claude-opus-4",
    "executor_model": "anthropic/claude-sonnet-4"
  }
}
```

### 5.3 配置加载优先级

1. 环境变量（`ANTHROPIC_API_KEY`）
2. Settings 文件
3. 默认值

---

## 六、与 MicroCompany 的集成点

### 6.1 我们需要的核心功能

1. **工具系统** - 完整的 Read、Edit、Bash、Glob、Grep 工具
2. **会话管理** - 初始化、消息处理、状态维护
3. **流式响应** - 实时显示 AI 回复
4. **工作目录上下文** - AI 感知当前目录
5. **配置兼容** - 使用我们现有的配置

### 6.2 集成策略

**方案 A: 直接依赖 Claurst crates**
- ✅ 优点: 复用所有功能，维护简单
- ❌ 缺点: 依赖较重，需要适配 Tauri 环境

**方案 B: 提取核心代码**
- ✅ 优点: 轻量，完全控制
- ❌ 缺点: 需要大量复制代码，维护困难

**推荐: 方案 A**，通过封装层适配到 Tauri。

### 6.3 需要的封装层

```rust
// src-tauri/src/claurst/mod.rs

pub struct ClaurstSession {
    config: QueryConfig,
    tools: Vec<Box<dyn Tool>>,
    context: ToolContext,
    messages: Vec<Message>,
}

impl ClaurstSession {
    pub fn new(working_dir: PathBuf, api_key: String) -> Result<Self> {
        // 1. 创建 Config
        // 2. 注册工具
        // 3. 创建 ToolContext
        // 4. 初始化消息历史
    }
    
    pub async fn send_message(&mut self, message: &str, window: Window) -> Result<String> {
        // 1. 添加用户消息到历史
        // 2. 调用 run_query_loop
        // 3. 处理流式响应，通过 window.emit 发送到前端
        // 4. 处理工具调用
        // 5. 返回最终回复
    }
}
```

---

## 七、技术挑战和解决方案

### 7.1 异步运行时

**挑战**: Claurst 使用 Tokio，Tauri 也使用 Tokio，需要确保兼容。

**解决方案**: 
- 使用 Tauri 的异步运行时
- 所有 Claurst 调用都在 async 上下文中

### 7.2 流式响应到前端

**挑战**: Claurst 的流式响应需要实时发送到前端。

**解决方案**:
```rust
// 在 run_query_loop 中
while let Some(event) = stream.next().await {
    match event {
        AnthropicStreamEvent::ContentBlockDelta { delta, .. } => {
            if let ContentBlockDelta::TextDelta { text } = delta {
                window.emit("message-chunk", text)?;
            }
        }
        // ...
    }
}
```

### 7.3 工具调用可视化

**挑战**: 前端需要知道正在执行哪个工具。

**解决方案**:
```rust
// 执行工具前
window.emit("tool-call-start", json!({
    "tool": tool_name,
    "action": action_description,
}))?;

// 执行工具
let result = tool.execute(input, &ctx).await;

// 执行完成
window.emit("tool-call-end", json!({
    "tool": tool_name,
    "success": !result.is_error,
    "result": result.content,
}))?;
```

### 7.4 配置兼容性

**挑战**: Claurst 使用 `~/.claurst/settings.json`，我们使用 `~/.microcompany/config.json`。

**解决方案**:
- 读取我们的配置文件
- 转换为 Claurst 的 `Config` 结构
- 不依赖 Claurst 的配置加载逻辑

---

## 八、性能考虑

### 8.1 内存使用

- Claurst 的消息历史会随对话增长
- 需要实现自动压缩（Claurst 已有 `compact.rs`）
- 估计: 100 轮对话约 10-20MB

### 8.2 启动时间

- 首次加载 Claurst crates: ~100-200ms
- 工具注册: ~10ms
- 总体影响: 可接受

### 8.3 响应延迟

- 流式响应: 首字节延迟 ~500ms（API 延迟）
- 工具执行: 取决于具体工具（文件读取 <10ms，命令执行变化大）

---

## 九、下一步

1. ✅ 完成架构分析
2. ⏳ 创建集成方案文档
3. ⏳ 验证 Claurst crates 编译
4. ⏳ 实现封装层
5. ⏳ 集成到 Tauri 后端
6. ⏳ 更新前端
7. ⏳ 测试和调试

---

**文档状态**: ✅ 已完成  
**下一步**: 创建详细的集成方案
