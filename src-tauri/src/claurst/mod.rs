use claurst_core::{Config, PermissionMode, Message, MessageContent, ContentBlock, CostTracker};
use claurst_query::{QueryConfig, QueryOutcome, QueryEvent, run_query_loop};
use claurst_tools::{
    Tool, ToolContext,
    FileReadTool, FileEditTool, FileWriteTool,
    BashTool, GlobTool, GrepTool, WebSearchTool,
};
use claurst_api::{AnthropicClient, client::ClientConfig};
use crate::storage::{ConversationStorage, StoredMessage};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{Emitter, Window};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone)]
struct TaskTraceContext {
    task_id: String,
    role_id: String,
    role_name: String,
    handoff_enabled: bool,
    prompt_source_type: Option<String>,
    prompt_hash: Option<String>,
    prompt_contract_version: Option<String>,
    role_display_order: Option<i32>,
    role_roster_summary: String,
    handoff_candidates_summary: String,
}

fn load_task_trace_context(session_id: &str) -> Option<TaskTraceContext> {
    let pool = crate::database::get_pool().ok()?;
    let conn = pool.get().ok()?;
    let mut stmt = conn.prepare(
        "SELECT s.task_id, s.role_id, r.name, r.handoff_enabled, r.prompt_source_type, r.prompt_hash, r.prompt_contract_version, r.display_order
         FROM sessions s
         JOIN roles r ON r.id = s.role_id
         WHERE s.id = ?1"
    ).ok()?;

    stmt.query_row(
        rusqlite::params![session_id],
        |row| {
            Ok(TaskTraceContext {
                task_id: row.get(0)?,
                role_id: row.get(1)?,
                role_name: row.get(2)?,
                handoff_enabled: row.get(3)?,
                prompt_source_type: row.get(4)?,
                prompt_hash: row.get(5)?,
                prompt_contract_version: row.get(6)?,
                role_display_order: row.get(7).ok(),
                role_roster_summary: String::new(),
                handoff_candidates_summary: String::new(),
            })
        },
    ).ok().map(|mut trace| {
        if let Ok(mut roster_stmt) = conn.prepare(
            "SELECT name, identity, archetype_id
             FROM roles
             WHERE task_id = ?1
             ORDER BY display_order, created_at"
        ) {
            if let Ok(rows) = roster_stmt.query_map(rusqlite::params![&trace.task_id], |row| {
                let name: String = row.get(0)?;
                let identity: String = row.get(1)?;
                let archetype_id: Option<String> = row.get(2)?;
                Ok(match archetype_id.as_deref().filter(|value| !value.is_empty()) {
                    Some(archetype_id) => format!("{}:{}:{}", name, identity, archetype_id),
                    None => format!("{}:{}", name, identity),
                })
            }) {
                trace.role_roster_summary = rows.filter_map(|row| row.ok()).collect::<Vec<_>>().join("|");
            }
        }

        if let Ok(mut handoff_stmt) = conn.prepare(
            "SELECT r2.name
             FROM roles r_current
             LEFT JOIN roles r2
               ON r2.task_id = r_current.task_id
              AND r2.id != r_current.id
             WHERE r_current.id = ?1
               AND r2.archetype_id IS NOT NULL
               AND EXISTS (
                   SELECT 1
                   FROM archetypes a,
                        json_each(
                            COALESCE(json_extract(a.content, '$.recommendedNextArchetypes'), '[]')
                        ) AS next_arch
                   WHERE a.id = r_current.archetype_id
                     AND next_arch.value = r2.archetype_id
               )"
        ) {
            if let Ok(rows) = handoff_stmt.query_map(rusqlite::params![&trace.role_id], |row| {
                row.get::<_, String>(0)
            }) {
                let names = rows.filter_map(|row| row.ok()).collect::<Vec<_>>();
                trace.handoff_candidates_summary = if names.is_empty() {
                    "none".to_string()
                } else {
                    names.join("|")
                };
            }
        }

        if trace.handoff_candidates_summary.is_empty() {
            trace.handoff_candidates_summary = "none".to_string();
        }

        trace
    })
}

fn build_prompt_preview(prompt_snapshot: Option<&str>) -> String {
    const PREVIEW_LIMIT: usize = 120;

    prompt_snapshot
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            let preview: String = value.chars().take(PREVIEW_LIMIT).collect();
            preview.replace('\n', "\\n")
        })
        .unwrap_or_else(|| "none".to_string())
}

/// Generate a title from the first user message
fn generate_title(first_message: &str) -> String {
    let max_length = 30;
    let trimmed = first_message.trim();

    if trimmed.len() <= max_length {
        trimmed.to_string()
    } else {
        // Find the last space before max_length to avoid cutting words
        let truncated = &trimmed[..max_length];
        if let Some(last_space) = truncated.rfind(' ') {
            format!("{}...", &trimmed[..last_space])
        } else {
            format!("{}...", truncated)
        }
    }
}

fn collect_final_text_from_blocks(blocks: &[ContentBlock]) -> String {
    blocks
        .iter()
        .filter_map(|block| match block {
            ContentBlock::Text { text } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct HandoffSuggestion {
    recommended: bool,
    target_role_id: Option<String>,
    target_role_name: Option<String>,
    reason: String,
    draft_message: String,
}

#[derive(Debug, Clone)]
struct ParsedHandoffBlock {
    visible_text: String,
    recommended: bool,
    target_role_name: Option<String>,
    reason: String,
    draft_message: String,
}

#[derive(Debug, Clone)]
struct TaskRosterRole {
    role_id: String,
    role_name: String,
}

fn save_message_to_file_storage(
    storage: &ConversationStorage,
    session_id: &str,
    message: StoredMessage,
    task_session: bool,
    role_label: &str,
) {
    if task_session {
        log::info!(
            "Skipping file storage save for task session {} message on session {}",
            role_label,
            session_id
        );
        return;
    }

    if let Err(error) = storage.save_message(session_id, message) {
        log::warn!("Failed to save {} message to storage: {}", role_label, error);
    }
}

fn extract_handoff_block(text: &str) -> Option<ParsedHandoffBlock> {
    let start_tag = "[HANDOFF]";
    let end_tag = "[/HANDOFF]";
    let start = text.rfind(start_tag)?;
    let end = text[start..].find(end_tag)? + start;
    let block_content = &text[start + start_tag.len()..end];
    let visible_text = text[..start].trim_end().to_string();

    let mut fields = HashMap::new();
    for line in block_content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Some((key, value)) = trimmed.split_once(':') else {
            continue;
        };
        fields.insert(key.trim().to_lowercase(), value.trim().to_string());
    }

    let recommended_raw = fields.get("recommended")?.trim().to_lowercase();
    let recommended = matches!(recommended_raw.as_str(), "yes" | "true" | "是");
    let target_role_name = fields
        .get("target_role")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let reason = fields
        .get("reason")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())?;
    let draft_message = fields
        .get("draft_message")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())?;

    Some(ParsedHandoffBlock {
        visible_text,
        recommended,
        target_role_name,
        reason,
        draft_message,
    })
}

fn load_task_roster(session_id: &str) -> Option<(String, Vec<TaskRosterRole>)> {
    let pool = crate::database::get_pool().ok()?;
    let conn = pool.get().ok()?;

    let (task_id, current_role_id): (String, String) = conn.query_row(
        "SELECT task_id, role_id FROM sessions WHERE id = ?1 AND task_id IS NOT NULL AND role_id IS NOT NULL",
        rusqlite::params![session_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).ok()?;

    let mut stmt = conn.prepare(
        "SELECT id, name FROM roles WHERE task_id = ?1 ORDER BY display_order, created_at"
    ).ok()?;

    let rows = stmt.query_map(rusqlite::params![&task_id], |row| {
        Ok(TaskRosterRole {
            role_id: row.get(0)?,
            role_name: row.get(1)?,
        })
    }).ok()?;

    let roles = rows.collect::<Result<Vec<_>, _>>().ok()?;
    Some((current_role_id, roles))
}

fn resolve_handoff_suggestion(session_id: &str, parsed: ParsedHandoffBlock) -> Option<HandoffSuggestion> {
    let (current_role_id, roster) = load_task_roster(session_id)?;
    let target_lookup = roster
        .iter()
        .map(|role| (role.role_name.trim().to_lowercase(), role))
        .collect::<HashMap<_, _>>();
    let roster_role_ids = roster.iter().map(|role| role.role_id.clone()).collect::<HashSet<_>>();

    if !parsed.recommended {
        return Some(HandoffSuggestion {
            recommended: false,
            target_role_id: None,
            target_role_name: None,
            reason: parsed.reason,
            draft_message: parsed.draft_message,
        });
    }

    let target_name = parsed.target_role_name.as_ref()?.trim().to_lowercase();
    let target_role = target_lookup.get(&target_name)?;
    if !roster_role_ids.contains(&target_role.role_id) || target_role.role_id == current_role_id {
        return None;
    }

    Some(HandoffSuggestion {
        recommended: true,
        target_role_id: Some(target_role.role_id.clone()),
        target_role_name: Some(target_role.role_name.clone()),
        reason: parsed.reason,
        draft_message: parsed.draft_message,
    })
}

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
    pub fn get_session_id(&self) -> &str {
        &self.session_id
    }

    pub fn new(
        session_id: String,
        working_dir: PathBuf,
        api_key: String,
        model: String,
        base_url: Option<String>,
        system_prompt: Option<String>,
    ) -> anyhow::Result<Self> {
        // 1. 创建 ClientConfig
        let api_base = base_url.unwrap_or_else(|| "https://api.anthropic.com".to_string());
        let task_trace = load_task_trace_context(&session_id);
        let prompt_chars = system_prompt
            .as_ref()
            .map(|value| value.chars().count())
            .unwrap_or(0);
        let prompt_preview = build_prompt_preview(system_prompt.as_deref());

        if let Some(trace) = task_trace.as_ref() {
            log::info!(
                "claurst_session_init_begin session_id={} task_id={} role_id={} role_name={} handoff_enabled={} model={} working_dir={} prompt_source_type={} prompt_hash={} prompt_contract_version={} role_display_order={} role_roster={} handoff_candidates={} prompt_chars={} prompt_preview={}",
                session_id,
                trace.task_id,
                trace.role_id,
                trace.role_name,
                trace.handoff_enabled,
                model,
                working_dir.display(),
                trace.prompt_source_type.as_deref().unwrap_or("unknown"),
                trace.prompt_hash.as_deref().unwrap_or("unknown"),
                trace.prompt_contract_version.as_deref().unwrap_or("unknown"),
                trace.role_display_order.map(|value| value.to_string()).unwrap_or_else(|| "unknown".to_string()),
                trace.role_roster_summary,
                trace.handoff_candidates_summary,
                prompt_chars,
                prompt_preview
            );
        } else {
            log::info!(
                "claurst_session_init_begin session_id={} model={} working_dir={} prompt_chars={} prompt_preview={}",
                session_id,
                model,
                working_dir.display(),
                prompt_chars,
                prompt_preview
            );
        }

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
        query_config.system_prompt = system_prompt;

        // 5. 注册工具
        let tools: Vec<Box<dyn Tool>> = vec![
            Box::new(FileReadTool),
            Box::new(FileEditTool),
            Box::new(FileWriteTool),
            Box::new(BashTool),
            Box::new(GlobTool),
            Box::new(GrepTool),
            Box::new(WebSearchTool),
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
            pending_permissions: None,
            permission_manager: None,
        };

        // 7. 创建存储层
        let storage = ConversationStorage::new()?;

        let messages: Vec<Message> = if let Ok(pool) = crate::database::get_pool() {
            if let Ok(conn) = pool.get() {
                match conn.prepare("SELECT role, content FROM messages WHERE session_id = ?1 ORDER BY created_at ASC") {
                    Ok(mut stmt) => {
                        match stmt.query_map(rusqlite::params![&session_id], |row| {
                            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                        }) {
                            Ok(rows) => {
                                let db_messages: Vec<Message> = rows
                                    .filter_map(|r| r.ok())
                                    .map(|(role, content)| {
                                        if role == "user" {
                                            Message::user(content)
                                        } else {
                                            Message::assistant(content)
                                        }
                                    })
                                    .collect();

                                if !db_messages.is_empty() {
                                    log::info!("Loaded {} messages from database for session {}", db_messages.len(), session_id);
                                    db_messages
                                } else {
                                    // No messages in DB, try file storage
                                    storage.load_messages(&session_id)
                                        .map(|msgs| {
                                            log::info!("Loaded {} messages from file storage for session {}", msgs.len(), session_id);
                                            msgs.into_iter()
                                                .map(|m| if m.role == "user" { Message::user(m.content) } else { Message::assistant(m.content) })
                                                .collect()
                                        })
                                        .unwrap_or_else(|_| {
                                            log::info!("No messages found for session {}", session_id);
                                            Vec::new()
                                        })
                                }
                            }
                            Err(e) => {
                                log::warn!("Failed to query messages from database: {}, trying file storage", e);
                                storage.load_messages(&session_id).unwrap_or_default()
                                    .into_iter()
                                    .map(|m| if m.role == "user" { Message::user(m.content) } else { Message::assistant(m.content) })
                                    .collect()
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to prepare statement: {}, trying file storage", e);
                        storage.load_messages(&session_id).unwrap_or_default()
                            .into_iter()
                            .map(|m| if m.role == "user" { Message::user(m.content) } else { Message::assistant(m.content) })
                            .collect()
                    }
                }
            } else {
                log::warn!("Failed to get database connection, trying file storage");
                storage.load_messages(&session_id).unwrap_or_default()
                    .into_iter()
                    .map(|m| if m.role == "user" { Message::user(m.content) } else { Message::assistant(m.content) })
                    .collect()
            }
        } else {
            log::warn!("Database pool unavailable, trying file storage");
            storage.load_messages(&session_id).unwrap_or_default()
                .into_iter()
                .map(|m| if m.role == "user" { Message::user(m.content) } else { Message::assistant(m.content) })
                .collect()
        };

        if let Some(trace) = task_trace.as_ref() {
            log::info!(
                "claurst_session_init_ready session_id={} task_id={} role_id={} role_name={} loaded_messages={} prompt_hash_present={}",
                session_id,
                trace.task_id,
                trace.role_id,
                trace.role_name,
                messages.len(),
                trace.prompt_hash.is_some()
            );
        } else {
            log::info!(
                "claurst_session_init_ready session_id={} loaded_messages={}",
                session_id,
                messages.len()
            );
        }

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
        let task_trace = load_task_trace_context(&self.session_id);
        let task_session = task_trace.is_some();

        // 1. 添加用户消息
        self.messages.push(Message::user(message.to_string()));
        if let Some(trace) = task_trace.as_ref() {
            log::info!(
                "claurst_request_user_message_saved request_id={} session_id={} task_id={} role_id={} role_name={} total_messages={} message_chars={}",
                request_id,
                self.session_id,
                trace.task_id,
                trace.role_id,
                trace.role_name,
                self.messages.len(),
                message.chars().count()
            );
        } else {
            log::info!(
                "claurst_request_user_message_saved request_id={} session_id={} total_messages={} message_chars={}",
                request_id,
                self.session_id,
                self.messages.len(),
                message.chars().count()
            );
        }

        // 保存用户消息到存储
        save_message_to_file_storage(
            &self.storage,
            &self.session_id,
            StoredMessage {
                role: "user".to_string(),
                content: message.to_string(),
                timestamp: chrono::Utc::now().timestamp(),
            },
            task_session,
            "user",
        );

        // Also save to database
        if let Ok(pool) = crate::database::get_pool() {
            if let Ok(conn) = pool.get() {
                let msg_id = format!("msg-{}", uuid::Uuid::new_v4());
                let created_at = chrono::Utc::now().to_rfc3339();
                let _ = conn.execute(
                    "INSERT INTO messages (id, session_id, role, content, created_at, request_id, is_streaming)
                     VALUES (?1, ?2, 'user', ?3, ?4, ?5, 0)",
                    rusqlite::params![&msg_id, &self.session_id, message, &created_at, request_id],
                );

                // Update session title if this is the first user message
                let message_count: i32 = conn.query_row(
                    "SELECT COUNT(*) FROM messages WHERE session_id = ?1 AND role = 'user'",
                    rusqlite::params![&self.session_id],
                    |row| row.get(0),
                ).unwrap_or(0);

                if message_count == 1 {
                    let title = generate_title(message);
                    let _ = conn.execute(
                        "UPDATE sessions SET name = ?1, updated_at = ?2 WHERE id = ?3",
                        rusqlite::params![&title, &created_at, &self.session_id],
                    );
                }
            }
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
        let event_session_id = self.session_id.clone();
        let event_task_trace = task_trace.clone();
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
                        if let Some(trace) = event_task_trace.as_ref() {
                            log::info!(
                                "claurst_tool_start request_id={} session_id={} task_id={} role_id={} role_name={} tool={}",
                                event_request_id,
                                event_session_id,
                                trace.task_id,
                                trace.role_id,
                                trace.role_name,
                                tool_name
                            );
                        } else {
                            log::info!(
                                "claurst_tool_start request_id={} session_id={} tool={}",
                                event_request_id,
                                event_session_id,
                                tool_name
                            );
                        }

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

                        if let Some(trace) = event_task_trace.as_ref() {
                            log::info!(
                                "claurst_tool_end request_id={} session_id={} task_id={} role_id={} role_name={} tool={} success={} result_chars={}",
                                event_request_id,
                                event_session_id,
                                trace.task_id,
                                trace.role_id,
                                trace.role_name,
                                tool_name,
                                !is_error,
                                result.chars().count()
                            );
                        } else {
                            log::info!(
                                "claurst_tool_end request_id={} session_id={} tool={} success={} result_chars={}",
                                event_request_id,
                                event_session_id,
                                tool_name,
                                !is_error,
                                result.chars().count()
                            );
                        }

                        if is_error {
                            log::error!("Tool '{}' failed with error: {}", tool_name, result);
                        } else {
                            log::info!("Tool '{}' completed successfully", tool_name);
                        }

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
        if let Some(trace) = task_trace.as_ref() {
            log::info!(
                "claurst_request_begin request_id={} session_id={} task_id={} role_id={} role_name={} model={} working_dir={} prompt_source_type={} prompt_hash={} prompt_contract_version={} prompt_chars={} prompt_preview={} history_messages={}",
                request_id,
                self.session_id,
                trace.task_id,
                trace.role_id,
                trace.role_name,
                self.config.model,
                self.working_dir.display(),
                trace.prompt_source_type.as_deref().unwrap_or("unknown"),
                trace.prompt_hash.as_deref().unwrap_or("unknown"),
                trace.prompt_contract_version.as_deref().unwrap_or("unknown"),
                self.config
                    .system_prompt
                    .as_ref()
                    .map(|value| value.chars().count())
                    .unwrap_or(0),
                build_prompt_preview(self.config.system_prompt.as_deref()),
                self.messages.len()
            );
        } else {
            log::info!(
                "claurst_request_begin request_id={} session_id={} model={} working_dir={} prompt_chars={} prompt_preview={} history_messages={}",
                request_id,
                self.session_id,
                self.config.model,
                self.working_dir.display(),
                self.config
                    .system_prompt
                    .as_ref()
                    .map(|value| value.chars().count())
                    .unwrap_or(0),
                build_prompt_preview(self.config.system_prompt.as_deref()),
                self.messages.len()
            );
        }

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

        if let Some(trace) = task_trace.as_ref() {
            log::info!(
                "claurst_request_outcome request_id={} session_id={} task_id={} role_id={} role_name={} outcome={:?}",
                request_id,
                self.session_id,
                trace.task_id,
                trace.role_id,
                trace.role_name,
                std::mem::discriminant(&outcome)
            );
        } else {
            log::info!(
                "claurst_request_outcome request_id={} session_id={} outcome={:?}",
                request_id,
                self.session_id,
                std::mem::discriminant(&outcome)
            );
        }

        // 5. 处理结果并发送终态事件
        match outcome {
            QueryOutcome::EndTurn { message, .. } => {
                // 优先从 message.content 提取文本
                let mut text = match &message.content {
                    MessageContent::Text(s) => s.trim().to_string(),
                    MessageContent::Blocks(blocks) => collect_final_text_from_blocks(blocks),
                };

                log::info!("🔍 [DEBUG] EndTurn message.content extracted text length: {}", text.len());
                if !text.is_empty() {
                    log::info!("🔍 [DEBUG] EndTurn text preview (first 200 chars): {}",
                        text.chars().take(200).collect::<String>());
                }

                // 如果 message.content 为空，从 self.messages 中获取最后一条 assistant 消息
                // 注意：这里获取的是完整的累积文本，而不是中间的流式片段
                if text.is_empty() {
                    log::info!("🔍 [DEBUG] text is empty, searching in self.messages (total: {})", self.messages.len());

                    // 获取最后一条 assistant 消息的完整文本
                    if let Some(last_assistant_msg) = self.messages.iter().rev().find(|msg| matches!(msg.role, claurst_core::Role::Assistant)) {
                        text = last_assistant_msg.get_all_text().trim().to_string();
                        log::info!("🔍 [DEBUG] Found assistant message text length: {}", text.len());
                        if !text.is_empty() {
                            log::info!("🔍 [DEBUG] Assistant message text preview (first 200 chars): {}",
                                text.chars().take(200).collect::<String>());
                        }
                    }
                }

                let handoff_suggestion = extract_handoff_block(&text)
                    .and_then(|parsed| {
                        let visible_text = parsed.visible_text.clone();
                        resolve_handoff_suggestion(&self.session_id, parsed)
                            .map(|suggestion| (visible_text, suggestion))
                    });

                if let Some((visible_text, _)) = handoff_suggestion.as_ref() {
                    text = visible_text.clone();
                }

                log::info!("🔍 [DEBUG] Final text to send in ai-request-end, length: {} chars", text.len());
                if !text.is_empty() {
                    log::info!("🔍 [DEBUG] Final text preview (first 200 chars): {}",
                        text.chars().take(200).collect::<String>());
                }

                log::info!("AI response received, length: {} chars", text.len());

                save_message_to_file_storage(
                    &self.storage,
                    &self.session_id,
                    StoredMessage {
                        role: "assistant".to_string(),
                        content: text.clone(),
                        timestamp: chrono::Utc::now().timestamp(),
                    },
                    task_session,
                    "assistant",
                );

                if let Some(trace) = task_trace.as_ref() {
                    log::info!(
                        "claurst_request_success request_id={} session_id={} task_id={} role_id={} role_name={} response_chars={}",
                        request_id_owned,
                        self.session_id,
                        trace.task_id,
                        trace.role_id,
                        trace.role_name,
                        text.chars().count()
                    );
                } else {
                    log::info!(
                        "claurst_request_success request_id={} session_id={} response_chars={}",
                        request_id_owned,
                        self.session_id,
                        text.chars().count()
                    );
                }

                // Also save to database
                if let Ok(pool) = crate::database::get_pool() {
                    if let Ok(conn) = pool.get() {
                        let msg_id = format!("msg-{}", uuid::Uuid::new_v4());
                        let created_at = chrono::Utc::now().to_rfc3339();
                        let _ = conn.execute(
                            "INSERT INTO messages (id, session_id, role, content, created_at, request_id, is_streaming)
                             VALUES (?1, ?2, 'assistant', ?3, ?4, ?5, 0)",
                            rusqlite::params![&msg_id, &self.session_id, &text, &created_at, &request_id_owned],
                        );
                    }
                }

                let now = chrono::Utc::now().timestamp_millis();
                let _ = window.emit("ai-request-end", serde_json::json!({
                    "request_id": request_id_owned.clone(),
                    "result": "success",
                    "final_text": text,
                    "handoffSuggestion": handoff_suggestion.as_ref().map(|(_, suggestion)| suggestion),
                    "timestamp": now,
                }));

                Ok(text)
            }
            QueryOutcome::Cancelled => {
                if let Some(trace) = task_trace.as_ref() {
                    log::warn!(
                        "claurst_request_cancelled request_id={} session_id={} task_id={} role_id={} role_name={}",
                        request_id_owned,
                        self.session_id,
                        trace.task_id,
                        trace.role_id,
                        trace.role_name
                    );
                } else {
                    log::warn!(
                        "claurst_request_cancelled request_id={} session_id={}",
                        request_id_owned,
                        self.session_id
                    );
                }

                let now = chrono::Utc::now().timestamp_millis();
                let _ = window.emit("ai-request-end", serde_json::json!({
                    "request_id": request_id_owned.clone(),
                    "result": "cancelled",
                    "timestamp": now,
                }));
                Err(anyhow::anyhow!("Request cancelled"))
            }
            QueryOutcome::Error(e) => {
                if let Some(trace) = task_trace.as_ref() {
                    log::error!(
                        "claurst_request_error request_id={} session_id={} task_id={} role_id={} role_name={} error={}",
                        request_id_owned,
                        self.session_id,
                        trace.task_id,
                        trace.role_id,
                        trace.role_name,
                        e
                    );
                } else {
                    log::error!(
                        "claurst_request_error request_id={} session_id={} error={}",
                        request_id_owned,
                        self.session_id,
                        e
                    );
                }

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
                if let Some(trace) = task_trace.as_ref() {
                    log::error!(
                        "claurst_request_budget_exceeded request_id={} session_id={} task_id={} role_id={} role_name={} cost_usd={:.4} limit_usd={:.4}",
                        request_id_owned,
                        self.session_id,
                        trace.task_id,
                        trace.role_id,
                        trace.role_name,
                        cost_usd,
                        limit_usd
                    );
                } else {
                    log::error!(
                        "claurst_request_budget_exceeded request_id={} session_id={} cost_usd={:.4} limit_usd={:.4}",
                        request_id_owned,
                        self.session_id,
                        cost_usd,
                        limit_usd
                    );
                }

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
                if let Some(trace) = task_trace.as_ref() {
                    log::error!(
                        "claurst_request_max_tokens request_id={} session_id={} task_id={} role_id={} role_name={}",
                        request_id_owned,
                        self.session_id,
                        trace.task_id,
                        trace.role_id,
                        trace.role_name
                    );
                } else {
                    log::error!(
                        "claurst_request_max_tokens request_id={} session_id={}",
                        request_id_owned,
                        self.session_id
                    );
                }

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

}

#[cfg(test)]
mod tests {
    use super::{extract_handoff_block, resolve_handoff_suggestion, ParsedHandoffBlock};

    #[test]
    fn extract_handoff_block_strips_machine_readable_suffix() {
        let input = "第一部分是给用户看的总结。\n\n[HANDOFF]\nrecommended: yes\ntarget_role: Reviewer\nreason: 需要代码评审\ndraft_message: 请从评审角度检查这次实现。\n[/HANDOFF]";
        let parsed = extract_handoff_block(input).expect("should parse handoff block");

        assert_eq!(parsed.visible_text, "第一部分是给用户看的总结。");
        assert!(parsed.recommended);
        assert_eq!(parsed.target_role_name.as_deref(), Some("Reviewer"));
        assert_eq!(parsed.reason, "需要代码评审");
        assert_eq!(parsed.draft_message, "请从评审角度检查这次实现。");
    }

    #[test]
    fn extract_handoff_block_accepts_non_recommended_result() {
        let input = "继续推进实现。\n[HANDOFF]\nrecommended: no\ntarget_role:\nreason: 当前暂不交接\ndraft_message: 当前无需发送交接消息，因为此阶段仍由我继续推进。\n[/HANDOFF]";
        let parsed = extract_handoff_block(input).expect("should parse handoff block");

        assert!(!parsed.recommended);
        assert_eq!(parsed.target_role_name, None);
    }

    #[test]
    fn resolve_handoff_suggestion_rejects_missing_roster_context() {
        let parsed = ParsedHandoffBlock {
            visible_text: "summary".to_string(),
            recommended: true,
            target_role_name: Some("Reviewer".to_string()),
            reason: "需要评审".to_string(),
            draft_message: "请评审。".to_string(),
        };

        assert!(resolve_handoff_suggestion("missing-session", parsed).is_none());
    }
}
