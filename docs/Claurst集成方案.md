# Claurst 集成方案

**文档版本**: 1.0  
**创建日期**: 2026-04-14  
**目标**: 将 Claurst 集成到 MicroCompany，实现完整的工具调用能力

---

## 一、集成目标

### 1.1 核心功能

- ✅ **工作目录上下文感知** - AI 完全了解当前工作目录
- ✅ **文件读取能力** - 读取任何文件，支持行范围、图片、PDF
- ✅ **文件编辑能力** - 精确字符串替换编辑
- ✅ **命令执行能力** - 执行 shell 命令，持久化 cwd 和 env
- ✅ **文件搜索能力** - Glob 模式匹配和 Grep 内容搜索
- ✅ **流式响应** - 实时显示 AI 回复
- ✅ **多轮对话** - 保持对话历史和上下文
- ✅ **工具调用可视化** - 显示工具执行过程

### 1.2 用户体验

- 启动应用后立即可用
- 选择工作目录后 AI 自动感知
- 流畅的对话体验
- 清晰的工具执行反馈
- 优雅的错误处理

---

## 二、技术架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                  MicroCompany (Tauri)                   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │         React Frontend (TypeScript)              │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │  Chat UI                                   │  │  │
│  │  │  - 消息显示（流式）                          │  │  │
│  │  │  - 工具调用指示器                            │  │  │
│  │  │  - 输入框                                   │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  └──────────────┬───────────────────────────────────┘  │
│                 │ Tauri Commands + Events               │
│                 │                                       │
│  ┌──────────────▼───────────────────────────────────┐  │
│  │         Rust Backend (Tauri)                     │  │
│  │                                                  │  │
│  │  ┌────────────────────────────────────────────┐ │  │
│  │  │  ClaurstSession (封装层)                   │ │  │
│  │  │  - 会话管理                                 │ │  │
│  │  │  - 消息处理                                 │ │  │
│  │  │  - 流式响应转发                             │ │  │
│  │  │  - 工具调用协调                             │ │  │
│  │  └──────────┬─────────────────────────────────┘ │  │
│  │             │                                    │  │
│  │  ┌──────────▼─────────────────────────────────┐ │  │
│  │  │  Claurst Crates                            │ │  │
│  │  │                                            │ │  │
│  │  │  ┌──────────────────────────────────────┐ │ │  │
│  │  │  │  claurst-query                       │ │ │  │
│  │  │  │  - run_query_loop()                  │ │ │  │
│  │  │  │  - 流式响应处理                       │ │ │  │
│  │  │  └──────────────────────────────────────┘ │ │  │
│  │  │                                            │ │  │
│  │  │  ┌──────────────────────────────────────┐ │ │  │
│  │  │  │  claurst-tools                       │ │ │  │
│  │  │  │  - Read, Edit, Write                 │ │ │  │
│  │  │  │  - Bash, Glob, Grep                  │ │ │  │
│  │  │  └──────────────────────────────────────┘ │ │  │
│  │  │                                            │ │  │
│  │  │  ┌──────────────────────────────────────┐ │ │  │
│  │  │  │  claurst-api                         │ │ │  │
│  │  │  │  - Anthropic API 客户端               │ │ │  │
│  │  │  │  - 流式响应解析                       │ │ │  │
│  │  │  └──────────────────────────────────────┘ │ │  │
│  │  │                                            │ │  │
│  │  │  ┌──────────────────────────────────────┐ │ │  │
│  │  │  │  claurst-core                        │ │ │  │
│  │  │  │  - Config, Settings                  │ │ │  │
│  │  │  │  - 权限管理                           │ │ │  │
│  │  │  │  - 成本追踪                           │ │ │  │
│  │  │  └──────────────────────────────────────┘ │ │  │
│  │  └────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                         │
                         │ HTTPS
                         ▼
              ┌──────────────────────┐
              │   Anthropic API      │
              │   (或自定义端点)      │
              └──────────────────────┘
```

### 2.2 数据流

#### 消息发送流程

```
用户输入消息
    ↓
前端调用 invoke('send_message', { message })
    ↓
Rust: send_message() 命令
    ↓
ClaurstSession::send_message()
    ├─ 添加用户消息到历史
    ├─ 构建 QueryConfig
    ├─ 调用 run_query_loop()
    └─ 处理流式响应
        ├─ TextDelta → window.emit('message-chunk', text)
        ├─ ToolUse → 执行工具 → window.emit('tool-call', info)
        └─ MessageStop → window.emit('message-complete')
    ↓
前端监听事件，更新 UI
```

#### 工具执行流程

```
AI 请求工具调用
    ↓
run_query_loop 检测到 ToolUse
    ↓
查找对应的 Tool 实现
    ↓
发送工具调用事件到前端
window.emit('tool-call-start', { tool, action })
    ↓
检查权限（自动允许，因为 permission_mode = Auto）
    ↓
执行 tool.execute(input, ctx)
    ├─ FileReadTool → 读取文件
    ├─ FileEditTool → 编辑文件
    ├─ BashTool → 执行命令
    ├─ GlobTool → 搜索文件
    └─ GrepTool → 搜索内容
    ↓
返回 ToolResult
    ↓
发送工具完成事件到前端
window.emit('tool-call-end', { tool, success, result })
    ↓
将结果添加到消息历史
    ↓
继续 run_query_loop（直到 end_turn）
```

---

## 三、实现细节

### 3.1 依赖配置

**文件**: `src-tauri/Cargo.toml`

```toml
[dependencies]
# 现有依赖
tauri = { version = "2", features = ["dialog"] }
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json"] }
parking_lot = "0.12"

# Claurst 依赖（使用 workspace 路径）
claurst-core = { path = "../claurst/src-rust/crates/core" }
claurst-api = { path = "../claurst/src-rust/crates/api" }
claurst-query = { path = "../claurst/src-rust/crates/query" }
claurst-tools = { path = "../claurst/src-rust/crates/tools" }
claurst-plugins = { path = "../claurst/src-rust/crates/plugins" }
claurst-mcp = { path = "../claurst/src-rust/crates/mcp" }

# Claurst 需要的额外依赖
async-trait = "0.1"
tracing = "0.1"
tracing-subscriber = "0.3"
anyhow = "1"
thiserror = "1"
```

### 3.2 封装层实现

**文件**: `src-tauri/src/claurst/mod.rs`

```rust
use claurst_core::{Config, Settings, PermissionMode};
use claurst_query::{QueryConfig, QueryOutcome, run_query_loop};
use claurst_tools::{
    Tool, ToolContext, ToolResult,
    FileReadTool, FileEditTool, FileWriteTool,
    BashTool, GlobTool, GrepTool,
};
use claurst_api::{AnthropicStreamEvent, ContentBlockDelta};
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::Mutex;
use tauri::Window;

pub struct ClaurstSession {
    working_dir: PathBuf,
    config: QueryConfig,
    messages: Arc<Mutex<Vec<claurst_core::Message>>>,
    tools: Vec<Box<dyn Tool>>,
    context: ToolContext,
}

impl ClaurstSession {
    pub fn new(
        working_dir: PathBuf,
        api_key: String,
        model: String,
        base_url: Option<String>,
    ) -> anyhow::Result<Self> {
        // 创建 Settings
        let mut settings = Settings::default();
        settings.anthropic_api_key = Some(api_key);
        settings.model = Some(model);
        settings.base_url = base_url;
        
        // 创建 Config
        let mut config = Config::from_settings(&settings);
        config.project_dir = Some(working_dir.clone());
        config.permission_mode = PermissionMode::Auto; // 自动允许所有操作
        
        // 创建 QueryConfig
        let query_config = QueryConfig::from_config(&config);
        
        // 注册工具
        let tools: Vec<Box<dyn Tool>> = vec![
            Box::new(FileReadTool),
            Box::new(FileEditTool),
            Box::new(FileWriteTool),
            Box::new(BashTool),
            Box::new(GlobTool),
            Box::new(GrepTool),
        ];
        
        // 创建 ToolContext
        let context = ToolContext {
            working_dir: working_dir.clone(),
            session_id: uuid::Uuid::new_v4().to_string(),
            permission_handler: Arc::new(claurst_core::AutoPermissionHandler),
            cost_tracker: Arc::new(claurst_core::CostTracker::new()),
            config: Arc::new(config),
        };
        
        Ok(Self {
            working_dir,
            config: query_config,
            messages: Arc::new(Mutex::new(Vec::new())),
            tools,
            context,
        })
    }
    
    pub async fn send_message(
        &mut self,
        message: &str,
        window: Window,
    ) -> anyhow::Result<String> {
        // 添加用户消息
        let user_msg = claurst_core::Message {
            role: claurst_core::Role::User,
            content: vec![claurst_core::ContentBlock::Text {
                text: message.to_string(),
            }],
        };
        
        self.messages.lock().push(user_msg);
        
        // 克隆消息历史
        let messages = self.messages.lock().clone();
        
        // 调用 run_query_loop
        let outcome = run_query_loop(
            self.config.clone(),
            messages,
            self.tools.clone(),
            self.context.clone(),
            Some(Box::new(move |event| {
                // 处理流式事件
                match event {
                    AnthropicStreamEvent::ContentBlockDelta { delta, .. } => {
                        if let ContentBlockDelta::TextDelta { text } = delta {
                            // 发送文本片段到前端
                            let _ = window.emit("message-chunk", text);
                        }
                    }
                    AnthropicStreamEvent::MessageStop => {
                        // 消息完成
                        let _ = window.emit("message-complete", ());
                    }
                    _ => {}
                }
            })),
        ).await?;
        
        // 处理结果
        match outcome {
            QueryOutcome::EndTurn { message, .. } => {
                // 添加助手消息到历史
                self.messages.lock().push(message.clone());
                
                // 提取文本内容
                let text = message.content.iter()
                    .filter_map(|block| {
                        if let claurst_core::ContentBlock::Text { text } = block {
                            Some(text.as_str())
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                
                Ok(text)
            }
            QueryOutcome::Error(e) => Err(e.into()),
            QueryOutcome::Cancelled => Err(anyhow::anyhow!("Cancelled")),
            QueryOutcome::BudgetExceeded { .. } => {
                Err(anyhow::anyhow!("Budget exceeded"))
            }
            QueryOutcome::MaxTokens { .. } => {
                Err(anyhow::anyhow!("Max tokens reached"))
            }
        }
    }
    
    pub fn get_working_dir(&self) -> &PathBuf {
        &self.working_dir
    }
}
```

### 3.3 Tauri 命令更新

**文件**: `src-tauri/src/commands/session.rs`

```rust
use std::sync::Arc;
use parking_lot::Mutex;
use tauri::State;
use crate::claurst::ClaurstSession;

pub struct AppState {
    pub session: Arc<Mutex<Option<ClaurstSession>>>,
}

#[tauri::command]
pub async fn initialize_session(
    directory: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // 加载配置
    let config = crate::commands::config::ApiConfig::load()
        .map_err(|e| format!("Failed to load config: {}", e))?;
    
    let api_key = config.anthropic_api_key
        .ok_or("API key not configured")?;
    
    // 创建 Claurst 会话
    let session = ClaurstSession::new(
        std::path::PathBuf::from(&directory),
        api_key,
        config.model,
        config.base_url,
    ).map_err(|e| format!("Failed to create session: {}", e))?;
    
    // 保存会话
    *state.session.lock() = Some(session);
    
    Ok(format!("Session initialized with directory: {}", directory))
}
```

**文件**: `src-tauri/src/commands/message.rs`

```rust
use tauri::{State, Window};
use crate::commands::session::AppState;

#[tauri::command]
pub async fn send_message(
    message: String,
    state: State<'_, AppState>,
    window: Window,
) -> Result<String, String> {
    // 获取会话
    let mut session_guard = state.session.lock();
    let session = session_guard.as_mut()
        .ok_or("Session not initialized")?;
    
    // 发送消息
    session.send_message(&message, window)
        .await
        .map_err(|e| format!("Failed to send message: {}", e))
}
```

### 3.4 前端更新

**文件**: `src/App.tsx`

```typescript
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface ToolCall {
  tool: string;
  action: string;
  status: 'running' | 'success' | 'error';
  result?: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentToolCall, setCurrentToolCall] = useState<ToolCall | null>(null);
  
  useEffect(() => {
    // 监听消息片段
    const unlistenChunk = listen<string>('message-chunk', (event) => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.isStreaming) {
          // 追加到最后一条消息
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + event.payload }
          ];
        } else {
          // 创建新消息
          return [
            ...prev,
            { role: 'assistant', content: event.payload, isStreaming: true }
          ];
        }
      });
    });
    
    // 监听消息完成
    const unlistenComplete = listen('message-complete', () => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.isStreaming) {
          return [
            ...prev.slice(0, -1),
            { ...last, isStreaming: false }
          ];
        }
        return prev;
      });
    });
    
    // 监听工具调用开始
    const unlistenToolStart = listen<{ tool: string; action: string }>(
      'tool-call-start',
      (event) => {
        setCurrentToolCall({
          tool: event.payload.tool,
          action: event.payload.action,
          status: 'running',
        });
      }
    );
    
    // 监听工具调用结束
    const unlistenToolEnd = listen<{ tool: string; success: boolean; result: string }>(
      'tool-call-end',
      (event) => {
        setCurrentToolCall(prev => prev ? {
          ...prev,
          status: event.payload.success ? 'success' : 'error',
          result: event.payload.result,
        } : null);
        
        // 3秒后清除工具调用显示
        setTimeout(() => setCurrentToolCall(null), 3000);
      }
    );
    
    return () => {
      unlistenChunk.then(f => f());
      unlistenComplete.then(f => f());
      unlistenToolStart.then(f => f());
      unlistenToolEnd.then(f => f());
    };
  }, []);
  
  const handleSendMessage = async (message: string) => {
    // 添加用户消息
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    
    try {
      // 发送到后端（流式响应通过事件接收）
      await invoke('send_message', { message });
    } catch (error) {
      console.error('Failed to send message:', error);
      // 显示错误
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${error}` }
      ]);
    }
  };
  
  return (
    <div className="app">
      {/* 工具调用指示器 */}
      {currentToolCall && (
        <div className={`tool-indicator tool-${currentToolCall.status}`}>
          <span className="tool-icon">🔧</span>
          <span className="tool-name">{currentToolCall.tool}</span>
          <span className="tool-action">{currentToolCall.action}</span>
          {currentToolCall.status === 'running' && <span className="spinner">⏳</span>}
          {currentToolCall.status === 'success' && <span className="check">✅</span>}
          {currentToolCall.status === 'error' && <span className="error">❌</span>}
        </div>
      )}
      
      {/* 消息列表 */}
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}`}>
            <ReactMarkdown>{msg.content}</ReactMarkdown>
            {msg.isStreaming && <span className="cursor">▊</span>}
          </div>
        ))}
      </div>
      
      {/* 输入框 */}
      <MessageInput onSend={handleSendMessage} />
    </div>
  );
}
```

---

## 四、配置兼容性

### 4.1 配置文件映射

**MicroCompany 配置** (`~/.microcompany/config.json`):
```json
{
  "anthropic_api_key": "sk-...",
  "model": "claude-sonnet-4-6",
  "base_url": "https://api.lycloud.top"
}
```

**转换为 Claurst Settings**:
```rust
let settings = Settings {
    anthropic_api_key: Some(config.anthropic_api_key),
    model: Some(config.model),
    base_url: config.base_url,
    provider: Some("anthropic".to_string()),
    permission_mode: Some(PermissionMode::Auto),
    ..Default::default()
};
```

### 4.2 环境变量支持

优先级：
1. 环境变量 `ANTHROPIC_API_KEY`
2. 配置文件 `~/.microcompany/config.json`
3. 默认值

---

## 五、测试计划

### 5.1 单元测试

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_session_creation() {
        let session = ClaurstSession::new(
            PathBuf::from("/tmp/test"),
            "test-key".to_string(),
            "claude-sonnet-4-6".to_string(),
            None,
        );
        assert!(session.is_ok());
    }
    
    #[tokio::test]
    async fn test_tool_registration() {
        let session = ClaurstSession::new(/* ... */).unwrap();
        assert_eq!(session.tools.len(), 6); // Read, Edit, Write, Bash, Glob, Grep
    }
}
```

### 5.2 集成测试

按照 `docs/验收标准.md` 中的测试用例：

1. **工作目录上下文感知**
   - 测试 1.1.1: 选择目录并初始化
   - 测试 1.1.2: AI 列出目录文件
   - 测试 1.1.3: AI 理解项目结构

2. **文件读取能力**
   - 测试 1.2.1: 读取代码文件
   - 测试 1.2.2: 读取配置文件
   - 测试 1.2.3: 读取大文件
   - 测试 1.2.4: 处理二进制文件

3. **文件编辑能力**
   - 测试 1.3.1: 修改单行代码
   - 测试 1.3.2: 添加新代码
   - 测试 1.3.3: 删除代码
   - 测试 1.3.4: 重构代码
   - 测试 1.3.5: 多文件编辑

4. **命令执行能力**
   - 测试 1.4.1: 执行简单命令
   - 测试 1.4.2: 执行测试命令
   - 测试 1.4.3: 执行构建命令
   - 测试 1.4.4: 执行 Git 命令
   - 测试 1.4.5: 处理命令错误

5. **文件搜索能力**
   - 测试 1.5.1: 按文件名搜索
   - 测试 1.5.2: 按内容搜索
   - 测试 1.5.3: 按模式搜索
   - 测试 1.5.4: 搜索并显示上下文

---

## 六、风险和缓解

### 6.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| Claurst crates 编译失败 | 高 | 中 | 先验证编译，解决依赖冲突 |
| 异步运行时冲突 | 高 | 低 | 使用 Tauri 的 Tokio 运行时 |
| 流式响应延迟 | 中 | 中 | 优化事件发送，使用批处理 |
| 内存占用过高 | 中 | 低 | 实现自动压缩，限制历史长度 |
| 工具执行权限问题 | 中 | 低 | 使用 Auto 权限模式 |

### 6.2 用户体验风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 首次启动慢 | 低 | 中 | 显示加载指示器 |
| 工具调用不可见 | 高 | 低 | 实现工具调用可视化 |
| 错误信息不清晰 | 中 | 中 | 友好的错误提示 |
| 长时间无响应 | 高 | 低 | 显示"正在思考"指示器 |

---

## 七、时间估算

| 任务 | 预计时间 | 依赖 |
|------|----------|------|
| 6.2 依赖配置 | 0.5 天 | - |
| 6.3 Claurst 封装层 | 2-3 天 | 6.2 |
| 6.4 更新后端命令 | 1 天 | 6.3 |
| 6.5 前端更新 | 1-2 天 | 6.4 |
| 6.6 测试和调试 | 1-2 天 | 6.5 |
| 6.7 文档更新 | 0.5 天 | 6.6 |
| **总计** | **6-9 天** | |

---

## 八、下一步行动

### 8.1 立即执行

1. ✅ 完成架构分析文档
2. ✅ 完成集成方案文档
3. ⏳ 验证 Claurst crates 编译
   ```bash
   cd src-tauri
   cargo check
   ```

### 8.2 后续步骤

4. 实现 `src-tauri/src/claurst/mod.rs` 封装层
5. 更新 `src-tauri/src/commands/session.rs`
6. 更新 `src-tauri/src/commands/message.rs`
7. 更新前端 `src/App.tsx`
8. 添加工具调用可视化组件
9. 运行集成测试
10. 修复发现的问题
11. 更新文档

---

## 九、成功标准

集成成功的标志：

- ✅ 应用可以启动并选择工作目录
- ✅ AI 可以感知工作目录内容
- ✅ AI 可以读取文件
- ✅ AI 可以编辑文件
- ✅ AI 可以执行命令
- ✅ AI 可以搜索文件和内容
- ✅ 流式响应正常工作
- ✅ 工具调用可视化正常
- ✅ 多轮对话保持上下文
- ✅ 错误处理完善
- ✅ 所有验收测试通过

---

**文档状态**: ✅ 已完成  
**下一步**: 验证 Claurst crates 编译
