use claurst_core::{Config, PermissionMode, Message, MessageContent, ContentBlock, CostTracker};
use claurst_query::{QueryConfig, QueryOutcome, QueryEvent, run_query_loop};
use claurst_tools::{
    Tool, ToolContext,
    FileReadTool, FileEditTool, FileWriteTool,
    BashTool, GlobTool, GrepTool,
};
use claurst_api::{AnthropicClient, client::ClientConfig};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{Emitter, Window};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

pub struct ClaurstSession {
    working_dir: PathBuf,
    client: AnthropicClient,
    config: QueryConfig,
    messages: Vec<Message>,
    tools: Vec<Box<dyn Tool>>,
    context: ToolContext,
    cost_tracker: Arc<CostTracker>,
}

impl ClaurstSession {
    pub fn new(
        working_dir: PathBuf,
        api_key: String,
        model: String,
        base_url: Option<String>,
    ) -> anyhow::Result<Self> {
        // 1. 创建 ClientConfig
        let client_config = ClientConfig {
            api_key,
            api_base: base_url.unwrap_or_else(|| "https://api.anthropic.com".to_string()),
            request_timeout: Duration::from_secs(120),
            ..Default::default()
        };

        // 2. 创建 AnthropicClient
        let client = AnthropicClient::new(client_config)?;

        // 3. 创建 Config
        let mut config = Config::default();
        config.project_dir = Some(working_dir.clone());
        config.permission_mode = PermissionMode::BypassPermissions;
        config.model = Some(model.clone());

        // 4. 创建 QueryConfig
        let mut query_config = QueryConfig::from_config(&config);
        query_config.model = model;

        // 5. 注册工具
        let tools: Vec<Box<dyn Tool>> = vec![
            Box::new(FileReadTool),
            Box::new(FileEditTool),
            Box::new(FileWriteTool),
            Box::new(BashTool),
            Box::new(GlobTool),
            Box::new(GrepTool),
        ];

        // 6. 创建 ToolContext
        let cost_tracker = Arc::new(CostTracker::new());
        let context = ToolContext {
            working_dir: working_dir.clone(),
            permission_mode: PermissionMode::BypassPermissions,
            permission_handler: Arc::new(claurst_core::AutoPermissionHandler {
                mode: PermissionMode::BypassPermissions,
            }),
            cost_tracker: Arc::clone(&cost_tracker),
            session_id: uuid::Uuid::new_v4().to_string(),
            file_history: Arc::new(parking_lot::Mutex::new(
                claurst_core::file_history::FileHistory::new()
            )),
            current_turn: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
            non_interactive: false,
            mcp_manager: None,
            config,
            managed_agent_config: None,
            completion_notifier: None,
        };

        Ok(Self {
            working_dir,
            client,
            config: query_config,
            messages: Vec::new(),
            tools,
            context,
            cost_tracker: Arc::clone(&cost_tracker),
        })
    }

    pub async fn send_message(
        &mut self,
        message: &str,
        window: Window,
    ) -> anyhow::Result<String> {
        // 1. 添加用户消息
        self.messages.push(Message::user(message.to_string()));

        // 2. 创建事件通道
        let (event_tx, mut event_rx) = mpsc::unbounded_channel();

        // 3. 创建取消令牌
        let cancel_token = CancellationToken::new();

        // 4. 启动事件处理任务
        tokio::spawn(async move {
            while let Some(event) = event_rx.recv().await {
                match event {
                    QueryEvent::Stream(stream_event) => {
                        use claurst_api::{AnthropicStreamEvent, streaming::ContentDelta};
                        match stream_event {
                            AnthropicStreamEvent::ContentBlockDelta { delta, .. } => {
                                if let ContentDelta::TextDelta { text } = delta {
                                    eprintln!("[DEBUG] Emitting chunk: {:?}", text);
                                    let _ = window.emit("message-chunk", text);
                                }
                            }
                            _ => {}
                        }
                    }
                    QueryEvent::ToolStart { tool_name, .. } => {
                        let description = format!("Executing {}", tool_name);
                        let _ = window.emit("tool-call-start", serde_json::json!({
                            "tool": tool_name,
                            "action": description,
                        }));
                    }
                    QueryEvent::ToolEnd { tool_name, result, is_error, .. } => {
                        let _ = window.emit("tool-call-end", serde_json::json!({
                            "tool": tool_name,
                            "success": !is_error,
                            "result": result,
                        }));
                    }
                    QueryEvent::TurnComplete { .. } => {
                        let _ = window.emit("message-complete", ());
                    }
                    _ => {}
                }
            }
        });

        // 5. 调用 run_query_loop
        let outcome = run_query_loop(
            &self.client,
            &mut self.messages,
            &self.tools,
            &self.context,
            &self.config,
            self.cost_tracker.clone(),
            Some(event_tx),
            cancel_token,
            None, // pending_messages
        ).await;

        // 6. 处理结果
        match outcome {
            QueryOutcome::EndTurn { message, .. } => {
                // 提取文本内容
                let text = match &message.content {
                    MessageContent::Text(s) => s.clone(),
                    MessageContent::Blocks(blocks) => {
                        blocks.iter()
                            .filter_map(|block| {
                                if let ContentBlock::Text { text } = block {
                                    Some(text.as_str())
                                } else {
                                    None
                                }
                            })
                            .collect::<Vec<_>>()
                            .join("\n")
                    }
                };

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


