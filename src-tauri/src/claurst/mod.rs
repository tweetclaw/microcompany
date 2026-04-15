use claurst_core::{Config, PermissionMode, Message, MessageContent, ContentBlock, CostTracker};
use claurst_query::{QueryConfig, QueryOutcome, QueryEvent, run_query_loop};
use claurst_tools::{
    Tool, ToolContext,
    FileReadTool, FileEditTool, FileWriteTool,
    BashTool, GlobTool, GrepTool,
};
use claurst_api::{AnthropicClient, client::ClientConfig};
use crate::storage::{ConversationStorage, StoredMessage};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{Emitter, Window};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

pub struct ClaurstSession {
    session_id: String,
    working_dir: PathBuf,
    client: AnthropicClient,
    config: QueryConfig,
    messages: Vec<Message>,
    tools: Vec<Box<dyn Tool>>,
    context: ToolContext,
    cost_tracker: Arc<CostTracker>,
    storage: ConversationStorage,
}

impl ClaurstSession {
    pub fn new(
        session_id: String,
        working_dir: PathBuf,
        api_key: String,
        model: String,
        base_url: Option<String>,
    ) -> anyhow::Result<Self> {
        // 1. 创建 ClientConfig
        let api_base = base_url.unwrap_or_else(|| "https://api.anthropic.com".to_string());
        log::info!("Initializing Claurst session {} with api_base: {}, model: {}", session_id, api_base, model);

        let client_config = ClientConfig {
            api_key: api_key.clone(),
            api_base,
            request_timeout: Duration::from_secs(120),
            ..Default::default()
        };

        // 2. 创建 AnthropicClient
        log::info!("Creating AnthropicClient...");
        let client = AnthropicClient::new(client_config)?;
        log::info!("AnthropicClient created successfully");

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

        // 7. 创建存储层
        let storage = ConversationStorage::new()?;

        // 8. 加载历史消息(如果会话已存在)
        let messages: Vec<Message> = if let Ok(stored_messages) = storage.load_messages(&session_id) {
            stored_messages.into_iter().map(|m| {
                if m.role == "user" {
                    Message::user(m.content)
                } else {
                    Message::assistant(m.content)
                }
            }).collect()
        } else {
            Vec::new()
        };

        Ok(Self {
            session_id,
            working_dir,
            client,
            config: query_config,
            messages,
            tools,
            context,
            cost_tracker: Arc::clone(&cost_tracker),
            storage,
        })
    }

    pub async fn send_message(
        &mut self,
        message: &str,
        window: Window,
    ) -> anyhow::Result<String> {
        // 1. 添加用户消息
        self.messages.push(Message::user(message.to_string()));
        log::info!("User message added, total messages: {}", self.messages.len());

        // 保存用户消息到存储
        if let Err(e) = self.storage.save_message(
            &self.session_id,
            StoredMessage {
                role: "user".to_string(),
                content: message.to_string(),
                timestamp: chrono::Utc::now().timestamp(),
            },
        ) {
            log::warn!("Failed to save user message to storage: {}", e);
            // Non-fatal: continue even if storage fails
        }

        // 2. 创建事件通道
        let (event_tx, mut event_rx) = mpsc::unbounded_channel();

        // 3. 创建取消令牌
        let cancel_token = CancellationToken::new();

        // 4. 启动事件处理任务
        let event_window = window.clone();
        tokio::spawn(async move {
            while let Some(event) = event_rx.recv().await {
                match event {
                    QueryEvent::Stream(stream_event) => {
                        use claurst_api::{AnthropicStreamEvent, streaming::ContentDelta};
                        match stream_event {
                            AnthropicStreamEvent::ContentBlockDelta { delta, .. } => {
                                if let ContentDelta::TextDelta { text } = delta {
                                    let _ = event_window.emit("message-chunk", text);
                                }
                            }
                            _ => {}
                        }
                    }
                    QueryEvent::ToolStart { tool_name, .. } => {
                        let description = format!("Executing {}", tool_name);
                        let _ = event_window.emit("tool-call-start", serde_json::json!({
                            "tool": tool_name,
                            "action": description,
                        }));
                    }
                    QueryEvent::ToolEnd { tool_name, result, is_error, .. } => {
                        let _ = event_window.emit("tool-call-end", serde_json::json!({
                            "tool": tool_name,
                            "success": !is_error,
                            "result": result,
                        }));
                    }
                    QueryEvent::TurnComplete { .. } => {
                        log::info!("Turn complete event received");
                    }
                    QueryEvent::Status(status) => {
                        log::info!("Query status: {}", status);
                    }
                    QueryEvent::Error(err) => {
                        log::error!("Query event error: {}", err);
                    }
                    _ => {}
                }
            }
        });

        // 5. 调用 run_query_loop
        log::info!("Starting query loop with {} messages", self.messages.len());
        log::info!("API config - model: {}", self.config.model);

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

        log::info!("Query loop completed with outcome: {:?}", std::mem::discriminant(&outcome));

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

                log::info!("AI response received, length: {} chars", text.len());

                // 保存助手消息到存储
                if let Err(e) = self.storage.save_message(
                    &self.session_id,
                    StoredMessage {
                        role: "assistant".to_string(),
                        content: text.clone(),
                        timestamp: chrono::Utc::now().timestamp(),
                    },
                ) {
                    log::warn!("Failed to save assistant message to storage: {}", e);
                    // Non-fatal: still return the response
                }

                Ok(text)
            }
            QueryOutcome::Error(e) => {
                log::error!("Query loop error: {:?}", e);
                Err(anyhow::anyhow!("API error: {}", e))
            }
            QueryOutcome::Cancelled => Err(anyhow::anyhow!("Request cancelled")),
            QueryOutcome::BudgetExceeded { cost_usd, limit_usd } => {
                Err(anyhow::anyhow!("Budget exceeded: ${:.4} / ${:.4}", cost_usd, limit_usd))
            }
            QueryOutcome::MaxTokens { .. } => {
                Err(anyhow::anyhow!("Max tokens reached"))
            }
        }
    }

    pub fn get_working_dir(&self) -> &PathBuf {
        &self.working_dir
    }

    pub fn get_session_id(&self) -> &str {
        &self.session_id
    }

    pub fn clear_history(&mut self) -> anyhow::Result<()> {
        self.storage.clear_messages(&self.session_id)?;
        self.messages.clear();
        Ok(())
    }
}
