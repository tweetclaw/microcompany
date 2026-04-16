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

fn infer_phase_from_status(status: &str) -> &'static str {
    let lower = status.to_lowercase();
    if lower.contains("tool") {
        "tool_running"
    } else if lower.contains("generat") || lower.contains("stream") || lower.contains("respond") {
        "generating"
    } else if lower.contains("final") || lower.contains("finish") || lower.contains("complete") {
        "finalizing"
    } else {
        "thinking"
    }
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
        request_id: &str,
        window: Window,
        cancel_token: CancellationToken,
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

        let timestamp = chrono::Utc::now().timestamp_millis();
        let _ = window.emit("ai-request-start", serde_json::json!({
            "request_id": request_id,
            "session_id": self.session_id.clone(),
            "timestamp": timestamp,
        }));
        let _ = window.emit("ai-status", serde_json::json!({
            "request_id": request_id,
            "phase": "thinking",
            "text": "思考中",
            "timestamp": timestamp,
        }));

        // 2. 创建事件通道
        let (event_tx, mut event_rx) = mpsc::unbounded_channel();

        // 3. 启动事件处理任务
        let event_window = window.clone();
        let request_id_owned = request_id.to_string();
        let event_request_id = request_id_owned.clone();
        tokio::spawn(async move {
            while let Some(event) = event_rx.recv().await {
                match event {
                    QueryEvent::Stream(stream_event) => {
                        use claurst_api::{streaming::ContentDelta, AnthropicStreamEvent};
                        if let AnthropicStreamEvent::ContentBlockDelta { delta, .. } = stream_event {
                            if let ContentDelta::TextDelta { text } = delta {
                                let _ = event_window.emit("message-chunk", serde_json::json!({
                                    "request_id": event_request_id.clone(),
                                    "chunk": text,
                                }));
                            }
                        }
                    }
                    QueryEvent::ToolStart { tool_name, .. } => {
                        let now = chrono::Utc::now().timestamp_millis();
                        let description = format!("Executing {}", tool_name);
                        let _ = event_window.emit("ai-status", serde_json::json!({
                            "request_id": event_request_id.clone(),
                            "phase": "tool_running",
                            "text": description,
                            "timestamp": now,
                        }));
                        let _ = event_window.emit("tool-call-start", serde_json::json!({
                            "request_id": event_request_id.clone(),
                            "tool": tool_name,
                            "action": description,
                        }));
                    }
                    QueryEvent::ToolEnd { tool_name, result, is_error, .. } => {
                        let now = chrono::Utc::now().timestamp_millis();
                        let _ = event_window.emit("tool-call-end", serde_json::json!({
                            "request_id": event_request_id.clone(),
                            "tool": tool_name,
                            "success": !is_error,
                            "result": result,
                        }));
                        let _ = event_window.emit("ai-status", serde_json::json!({
                            "request_id": event_request_id.clone(),
                            "phase": "thinking",
                            "text": "工具执行完成，继续处理中",
                            "timestamp": now,
                        }));
                    }
                    QueryEvent::TurnComplete { .. } => {
                        let now = chrono::Utc::now().timestamp_millis();
                        let _ = event_window.emit("ai-status", serde_json::json!({
                            "request_id": event_request_id.clone(),
                            "phase": "finalizing",
                            "text": "整理最终回答",
                            "timestamp": now,
                        }));
                    }
                    QueryEvent::Status(status) => {
                        let now = chrono::Utc::now().timestamp_millis();
                        let _ = event_window.emit("ai-status", serde_json::json!({
                            "request_id": event_request_id.clone(),
                            "phase": infer_phase_from_status(&status),
                            "text": status,
                            "timestamp": now,
                        }));
                    }
                    QueryEvent::Error(err) => {
                        let now = chrono::Utc::now().timestamp_millis();
                        log::error!("Query event error: {}", err);
                        let _ = event_window.emit("ai-status", serde_json::json!({
                            "request_id": event_request_id.clone(),
                            "phase": "finalizing",
                            "text": format!("发生错误: {}", err),
                            "timestamp": now,
                        }));
                    }
                    _ => {}
                }
            }
        });

        // 4. 调用 run_query_loop
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
            None,
        )
        .await;

        log::info!("Query loop completed with outcome: {:?}", std::mem::discriminant(&outcome));

        // 5. 处理结果并发送终态事件
        match outcome {
            QueryOutcome::EndTurn { message, .. } => {
                let text = match &message.content {
                    MessageContent::Text(s) => s.clone(),
                    MessageContent::Blocks(blocks) => blocks
                        .iter()
                        .filter_map(|block| {
                            if let ContentBlock::Text { text } = block {
                                Some(text.as_str())
                            } else {
                                None
                            }
                        })
                        .collect::<Vec<_>>()
                        .join("\n"),
                };

                log::info!("AI response received, length: {} chars", text.len());

                if let Err(e) = self.storage.save_message(
                    &self.session_id,
                    StoredMessage {
                        role: "assistant".to_string(),
                        content: text.clone(),
                        timestamp: chrono::Utc::now().timestamp(),
                    },
                ) {
                    log::warn!("Failed to save assistant message to storage: {}", e);
                }

                let now = chrono::Utc::now().timestamp_millis();
                let _ = window.emit("ai-request-end", serde_json::json!({
                    "request_id": request_id_owned.clone(),
                    "result": "success",
                    "timestamp": now,
                }));

                Ok(text)
            }
            QueryOutcome::Cancelled => {
                let now = chrono::Utc::now().timestamp_millis();
                let _ = window.emit("ai-request-end", serde_json::json!({
                    "request_id": request_id_owned.clone(),
                    "result": "cancelled",
                    "timestamp": now,
                }));
                Err(anyhow::anyhow!("Request cancelled"))
            }
            QueryOutcome::Error(e) => {
                log::error!("Query loop error: {:?}", e);
                let now = chrono::Utc::now().timestamp_millis();
                let _ = window.emit("ai-request-end", serde_json::json!({
                    "request_id": request_id_owned.clone(),
                    "result": "error",
                    "error_message": e.to_string(),
                    "timestamp": now,
                }));
                Err(anyhow::anyhow!("API error: {}", e))
            }
            QueryOutcome::BudgetExceeded { cost_usd, limit_usd } => {
                let message = format!("Budget exceeded: ${:.4} / ${:.4}", cost_usd, limit_usd);
                let now = chrono::Utc::now().timestamp_millis();
                let _ = window.emit("ai-request-end", serde_json::json!({
                    "request_id": request_id_owned.clone(),
                    "result": "error",
                    "error_message": message,
                    "timestamp": now,
                }));
                Err(anyhow::anyhow!("{}", message))
            }
            QueryOutcome::MaxTokens { .. } => {
                let message = "Max tokens reached".to_string();
                let now = chrono::Utc::now().timestamp_millis();
                let _ = window.emit("ai-request-end", serde_json::json!({
                    "request_id": request_id_owned,
                    "result": "error",
                    "error_message": message,
                    "timestamp": now,
                }));
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
