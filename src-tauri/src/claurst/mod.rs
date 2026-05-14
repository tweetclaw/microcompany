use claurst_core::{Config, PermissionMode, Message, MessageContent, ContentBlock, CostTracker, UsageInfo};
use claurst_query::{QueryConfig, QueryOutcome, QueryEvent, run_query_loop};
use claurst_tools::{
    Tool, ToolContext,
    FileReadTool, FileEditTool, FileWriteTool,
    BashTool, GlobTool, GrepTool, WebSearchTool,
};
use claurst_api::{AnthropicClient, client::ClientConfig};
use crate::storage::{ConversationStorage, StoredMessage};
use serde::Serialize;
use serde_json::Value;
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
    let char_count = trimmed.chars().count();

    if char_count <= max_length {
        trimmed.to_string()
    } else {
        // Find the last space before max_length to avoid cutting words
        let truncated: String = trimmed.chars().take(max_length).collect();
        if let Some(last_space_pos) = truncated.rfind(' ') {
            // Use character slicing instead of byte slicing to avoid UTF-8 boundary panic
            let chars_before_space = truncated[..last_space_pos].chars().count();
            let result: String = trimmed.chars().take(chars_before_space).collect();
            format!("{}...", result)
        } else {
            format!("{}...", truncated)
        }
    }
}

fn collect_final_text_from_blocks(blocks: &[ContentBlock]) -> String {
    // Only collect visible Text blocks — Thinking blocks must NOT be included here,
    // because they are rendered separately in the frontend timeline.
    // Including thinking caused final_text to be thinking+text concatenated,
    // making will_use_accumulated=false even when accumulated text was correct.
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

/// Filter out system tags like <system-reminder> from streaming content
/// This is a simple implementation that removes complete tags
fn filter_system_tags(text: &str) -> String {
    let mut result = text.to_string();

    // Remove <system-reminder>...</system-reminder> tags and their content
    while let Some(start) = result.find("<system-reminder>") {
        if let Some(end) = result[start..].find("</system-reminder>") {
            let end_pos = start + end + "</system-reminder>".len();
            result.replace_range(start..end_pos, "");
        } else {
            // If we find opening tag but no closing tag, remove from opening tag to end
            // This handles the case where the tag is incomplete in this chunk
            result.truncate(start);
            break;
        }
    }

    result
}

fn usage_to_json(usage: &UsageInfo) -> serde_json::Value {
    let total_tokens = usage.input_tokens
        + usage.output_tokens
        + usage.cache_creation_input_tokens
        + usage.cache_read_input_tokens;

    serde_json::json!({
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "cache_creation_input_tokens": usage.cache_creation_input_tokens,
        "cache_read_input_tokens": usage.cache_read_input_tokens,
        "total_tokens": total_tokens,
    })
}

#[derive(Debug, Clone)]
struct TerminalEventPayload {
    result: &'static str,
    outcome: &'static str,
    activity_phase_at_end: &'static str,
    reason_code: Option<&'static str>,
    error_message: Option<String>,
    final_text: Option<String>,
    has_visible_text: Option<bool>,
    handoff_suggestion: Option<HandoffSuggestion>,
    usage: Option<UsageInfo>,
    timeline: Option<Vec<TimelineItemData>>,
}

#[derive(Debug, Clone)]
struct CompletedToolOnlyDiagnosticContext {
    tool_sequence: Arc<parking_lot::Mutex<Vec<Value>>>,
    turn_summaries: Arc<parking_lot::Mutex<Vec<Value>>>,
}

#[derive(Debug, Clone, Serialize)]
struct TimelineItemData {
    id: String,
    item_type: String,  // "thinking", "tool_call", "output"
    timestamp: i64,
    content: Option<String>,
    tool: Option<String>,
    action: Option<String>,
    status: Option<String>,
    result: Option<String>,
    tool_use_id: Option<String>,  // Store original tool_id for matching in ToolEnd
}

impl TimelineItemData {
    fn thinking(id: String, timestamp: i64, content: String) -> Self {
        Self {
            id,
            item_type: "thinking".to_string(),
            timestamp,
            content: Some(content),
            tool: None,
            action: None,
            status: None,
            result: None,
            tool_use_id: None,
        }
    }

    fn output(id: String, timestamp: i64, content: String) -> Self {
        Self {
            id,
            item_type: "output".to_string(),
            timestamp,
            content: Some(content),
            tool: None,
            action: None,
            status: None,
            result: None,
            tool_use_id: None,
        }
    }

    fn tool_call(id: String, timestamp: i64, tool: String, action: String, tool_use_id: String) -> Self {
        Self {
            id,
            item_type: "tool_call".to_string(),
            timestamp,
            content: None,
            tool: Some(tool),
            action: Some(action),
            status: Some("running".to_string()),
            result: None,
            tool_use_id: Some(tool_use_id),
        }
    }
}

fn warning_to_json(warning_type: &str, message: String) -> Value {
    serde_json::json!({
        "warning_type": warning_type,
        "message": message,
    })
}

fn log_terminal_outcome(
    request_id: &str,
    session_id: &str,
    payload: &TerminalEventPayload,
    warnings: &[Value],
) {
    let final_text_chars = payload
        .final_text
        .as_ref()
        .map(|value| value.chars().count())
        .unwrap_or(0);
    let visible_text_preview = payload
        .final_text
        .as_ref()
        .map(|value| value.chars().take(120).collect::<String>().replace('\n', "\\n"))
        .unwrap_or_default();
    let total_tokens = payload.usage.as_ref().map(|usage| {
        usage.input_tokens
            + usage.output_tokens
            + usage.cache_creation_input_tokens
            + usage.cache_read_input_tokens
    });

    log::info!(
        "claurst_terminal_outcome request_id={} session_id={} result={} outcome={} activity_phase_at_end={} reason_code={} has_visible_text={} final_text_chars={} warnings_count={} handoff_present={} total_tokens={} final_text_preview={}",
        request_id,
        session_id,
        payload.result,
        payload.outcome,
        payload.activity_phase_at_end,
        payload.reason_code.unwrap_or("none"),
        payload.has_visible_text.unwrap_or(false),
        final_text_chars,
        warnings.len(),
        payload.handoff_suggestion.is_some(),
        total_tokens.map(|value| value.to_string()).unwrap_or_else(|| "unknown".to_string()),
        visible_text_preview
    );
}

fn emit_usage_event(
    window: &Window,
    request_id: &str,
    session_id: &str,
    scope: &str,
    usage: &UsageInfo,
) {
    let timestamp = chrono::Utc::now().timestamp_millis();
    log::info!(
        "claurst_usage request_id={} session_id={} scope={} total_tokens={}",
        request_id,
        session_id,
        scope,
        usage.input_tokens
            + usage.output_tokens
            + usage.cache_creation_input_tokens
            + usage.cache_read_input_tokens,
    );
    let _ = window.emit("ai-request-usage", serde_json::json!({
        "request_id": request_id,
        "session_id": session_id,
        "scope": scope,
        "usage": usage_to_json(usage),
        "timestamp": timestamp,
    }));
}

fn emit_terminal_event(
    window: &Window,
    request_id: &str,
    session_id: &str,
    payload: &TerminalEventPayload,
    warnings: &[Value],
) {
    let now = chrono::Utc::now().timestamp_millis();
    log_terminal_outcome(request_id, session_id, payload, warnings);
    let _ = window.emit("ai-request-end", serde_json::json!({
        "request_id": request_id,
        "session_id": session_id,
        "result": payload.result,
        "outcome": payload.outcome,
        "activity_phase_at_end": payload.activity_phase_at_end,
        "reason_code": payload.reason_code,
        "error_message": payload.error_message,
        "final_text": payload.final_text,
        "has_visible_text": payload.has_visible_text,
        "handoffSuggestion": payload.handoff_suggestion,
        "usage": payload.usage.as_ref().map(usage_to_json),
        "warnings": warnings,
        "timeline": payload.timeline.as_ref().map(|items| {
            items.iter().map(|item| {
                serde_json::json!({
                    "id": item.id,
                    "type": item.item_type,
                    "timestamp": item.timestamp,
                    "content": item.content,
                    "tool": item.tool,
                    "action": item.action,
                    "status": item.status,
                    "result": item.result,
                })
            }).collect::<Vec<_>>()
        }),
        "timestamp": now,
    }));
}

fn emit_display_status(window: &Window, request_id: &str, phase: &str, text: &str) {
    let now = chrono::Utc::now().timestamp_millis();
    let _ = window.emit("ai-status", serde_json::json!({
        "request_id": request_id,
        "phase": phase,
        "text": text,
        "timestamp": now,
    }));
}

fn take_text_from_message_content(content: &MessageContent) -> String {
    match content {
        MessageContent::Text(s) => s.trim().to_string(),
        MessageContent::Blocks(blocks) => collect_final_text_from_blocks(blocks),
    }
}

fn summarize_message_content(content: &MessageContent) -> Value {
    match content {
        MessageContent::Text(text) => serde_json::json!({
            "variant": "text",
            "char_count": text.chars().count(),
            "trimmed_char_count": text.trim().chars().count(),
            "preview": text.chars().take(120).collect::<String>().replace('\n', "\\n"),
        }),
        MessageContent::Blocks(blocks) => {
            let block_summaries = blocks
                .iter()
                .enumerate()
                .map(|(index, block)| match block {
                    ContentBlock::Text { text } => serde_json::json!({
                        "index": index,
                        "type": "text",
                        "char_count": text.chars().count(),
                        "trimmed_char_count": text.trim().chars().count(),
                        "preview": text.chars().take(120).collect::<String>().replace('\n', "\\n"),
                    }),
                    ContentBlock::ToolUse { name, .. } => serde_json::json!({
                        "index": index,
                        "type": "tool_use",
                        "name": name,
                    }),
                    ContentBlock::ToolResult { tool_use_id, .. } => serde_json::json!({
                        "index": index,
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                    }),
                    _ => serde_json::json!({
                        "index": index,
                        "type": "other",
                    }),
                })
                .collect::<Vec<_>>();

            serde_json::json!({
                "variant": "blocks",
                "block_count": blocks.len(),
                "blocks": block_summaries,
            })
        }
    }
}

fn emit_lifecycle_event(
    window: &Window,
    request_id: &str,
    session_id: &str,
    phase: &str,
    label: &str,
    source: &str,
) {
    let timestamp = chrono::Utc::now().timestamp_millis();
    log::info!(
        "claurst_lifecycle request_id={} session_id={} phase={} source={}",
        request_id,
        session_id,
        phase,
        source
    );
    let _ = window.emit("ai-request-lifecycle", serde_json::json!({
        "request_id": request_id,
        "session_id": session_id,
        "phase": phase,
        "label": label,
        "source": source,
        "timestamp": timestamp,
    }));
}

// Generate a descriptive action string based on tool name and parameters
fn generate_tool_description(tool_name: &str, input_json: &str) -> String {
    // Try to parse the input JSON to extract useful parameters
    if let Ok(input) = serde_json::from_str::<serde_json::Value>(input_json) {
        match tool_name {
            "Read" => {
                if let Some(file_path) = input.get("file_path").and_then(|v| v.as_str()) {
                    return format!("Read {}", file_path);
                }
            }
            "Edit" => {
                if let Some(file_path) = input.get("file_path").and_then(|v| v.as_str()) {
                    return format!("Edit {}", file_path);
                }
            }
            "Write" => {
                if let Some(file_path) = input.get("file_path").and_then(|v| v.as_str()) {
                    return format!("Write {}", file_path);
                }
            }
            "Bash" => {
                if let Some(command) = input.get("command").and_then(|v| v.as_str()) {
                    // Truncate long commands at char boundary
                    let truncated = if command.chars().count() > 80 {
                        command.chars().take(77).collect::<String>() + "..."
                    } else {
                        command.to_string()
                    };
                    return format!("Run: {}", truncated);
                }
            }
            "Glob" => {
                if let Some(pattern) = input.get("pattern").and_then(|v| v.as_str()) {
                    return format!("Search files: {}", pattern);
                }
            }
            "Grep" => {
                if let Some(pattern) = input.get("pattern").and_then(|v| v.as_str()) {
                    return format!("Search content: {}", pattern);
                }
            }
            "WebSearch" => {
                if let Some(query) = input.get("query").and_then(|v| v.as_str()) {
                    return format!("Web search: {}", query);
                }
            }
            _ => {}
        }
    }

    // Fallback to generic description
    format!("Executing {}", tool_name)
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
    #[allow(dead_code)]
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

    log::debug!("handoff_block_found block_content_length={}", block_content.len());

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

    log::debug!(
        "handoff_block_parsed recommended={} target_role_name={:?} has_reason={} has_draft_message={}",
        recommended,
        target_role_name,
        !reason.is_empty(),
        !draft_message.is_empty()
    );

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

    let resolved_target = parsed
        .target_role_name
        .as_ref()
        .map(|name| name.trim().to_lowercase())
        .and_then(|target_name| target_lookup.get(&target_name).copied())
        .filter(|target_role| {
            roster_role_ids.contains(&target_role.role_id) && target_role.role_id != current_role_id
        });

    // Always return handoff suggestion even if role name doesn't match
    // Frontend will allow user to manually select the target role
    Some(HandoffSuggestion {
        recommended: true,
        target_role_id: resolved_target.map(|role| role.role_id.clone()),
        target_role_name: resolved_target.map(|role| role.role_name.clone())
            .or_else(|| parsed.target_role_name.clone()), // Preserve AI's original suggestion
        reason: parsed.reason,
        draft_message: parsed.draft_message,
    })
}

pub struct ClaurstSession {
    session_id: String,
    working_dir: PathBuf,
    api_key: String,
    model: String,
    base_url: Option<String>,
    system_prompt: Option<String>,  // 角色提示词，仅用于首次请求的运行时注入
    role_prompt_prepended: bool,    // 标记是否已在运行时注入过角色提示词
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
        "streaming"
    } else if lower.contains("final") || lower.contains("finish") || lower.contains("complete") {
        "finalizing"
    } else {
        "thinking"
    }
}

fn status_label_for_phase(phase: &str) -> &'static str {
    match phase {
        "thinking" => "思考中",
        "tool_running" => "工具执行中",
        "streaming" => "生成回复中",
        "finalizing" => "整理最终回答",
        "completed" => "请求完成",
        "cancelled" => "请求已取消",
        "error" => "请求失败",
        _ => "处理中",
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
        let provider_base_url = base_url;
        let api_base = provider_base_url
            .clone()
            .unwrap_or_else(|| "https://api.anthropic.com".to_string());
        let task_trace = load_task_trace_context(&session_id);
        let is_task_session = task_trace.is_some();
        let prompt_chars = system_prompt
            .as_ref()
            .map(|value| value.chars().count())
            .unwrap_or(0);
        let prompt_preview = build_prompt_preview(system_prompt.as_deref());

        if let Some(trace) = task_trace.as_ref() {
            log::info!(
                "claurst_session_init_begin session_id={} task_id={} role_id={} role_name={} handoff_enabled={} model={} working_dir={} prompt_source_type={} prompt_hash={} prompt_contract_version={} role_display_order={} role_roster={} handoff_candidates={} prompt_chars={} prompt_preview={} is_task_session={} configured_system_prompt_chars={}",
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
                prompt_preview,
                is_task_session,
                if is_task_session { 0 } else { system_prompt.as_ref().map(|value| value.chars().count()).unwrap_or(0) }
            );
        } else {
            log::info!(
                "claurst_session_init_begin session_id={} model={} working_dir={} prompt_chars={} prompt_preview={} is_task_session={} configured_system_prompt_chars={}",
                session_id,
                model,
                working_dir.display(),
                prompt_chars,
                prompt_preview,
                is_task_session,
                if is_task_session { 0 } else { system_prompt.as_ref().map(|value| value.chars().count()).unwrap_or(0) }
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
        // Enable auto compact to handle long conversation histories
        config.auto_compact = true;
        config.compact_threshold = 0.7; // Trigger compact at 70% context usage (earlier than default 90%)

        // 4. 创建 QueryConfig
        let mut query_config = QueryConfig::from_config(&config);
        query_config.model = model;
        // Allow sufficient turns for AI to complete work and provide response
        query_config.max_turns = 50;
        query_config.system_prompt = if is_task_session {
            None
        } else {
            system_prompt.clone()
        };

        log::info!(
            "🔍 [ROLE_PROMPT] Session prompt routing: is_task_session={} incoming_prompt_chars={} configured_system_prompt_chars={}",
            is_task_session,
            system_prompt.as_ref().map(|s| s.len()).unwrap_or(0),
            query_config.system_prompt.as_ref().map(|s| s.len()).unwrap_or(0)
        );

        if let Some(ref prompt) = system_prompt {
            log::info!(
                "🔍 [ROLE_PROMPT] Role prompt length={} first_200_chars={}",
                prompt.len(),
                &prompt.chars().take(200).collect::<String>()
            );
            log::info!("📋 [FULL_ROLE_PROMPT_START]\n{}\n📋 [FULL_ROLE_PROMPT_END]", prompt);
        }

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
            user_question_tx: None,
        };

        // 7. 创建存储层
        let storage = ConversationStorage::new()?;

        let latest_message_limit = 20usize;
        let trim_stored_messages = |msgs: Vec<crate::storage::StoredMessage>| {
            let total_messages = msgs.len();
            let trimmed_msgs: Vec<crate::storage::StoredMessage> = if total_messages > latest_message_limit {
                msgs.into_iter()
                    .rev()
                    .take(latest_message_limit)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect()
            } else {
                msgs
            };

            (trimmed_msgs, total_messages)
        };

        let messages: Vec<Message> = if let Ok(pool) = crate::database::get_pool() {
            if let Ok(conn) = pool.get() {
                match conn.prepare(
                    "SELECT role, content FROM (
                        SELECT role, content, created_at
                        FROM messages
                        WHERE session_id = ?1
                        ORDER BY created_at DESC
                        LIMIT ?2
                    ) ORDER BY created_at ASC"
                ) {
                    Ok(mut stmt) => {
                        match stmt.query_map(rusqlite::params![&session_id, latest_message_limit as i64], |row| {
                            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                        }) {
                            Ok(rows) => {
                                let db_messages: Vec<Message> = rows
                                    .filter_map(|r| r.ok())
                                    .filter_map(|(role, content)| {
                                        // Filter out empty assistant messages to prevent API issues
                                        if role == "assistant" && content.trim().is_empty() {
                                            log::warn!("Skipping empty assistant message for session {}", session_id);
                                            None
                                        } else if role == "user" {
                                            Some(Message::user(content))
                                        } else {
                                            Some(Message::assistant(content))
                                        }
                                    })
                                    .collect();

                                if !db_messages.is_empty() {
                                    log::info!(
                                        "Loaded {} messages from database for session {} (restore limit {})",
                                        db_messages.len(),
                                        session_id,
                                        latest_message_limit
                                    );

                                    // Apply context collapse to limit message history
                                    use claurst_core::context_collapse::{collapse_context, CollapseStrategy, estimate_message_tokens};

                                    let estimated_tokens = estimate_message_tokens(&db_messages);
                                    let max_tokens = 100_000u64; // Conservative limit to support various models
                                    let should_collapse = estimated_tokens > max_tokens;

                                    log::info!(
                                        "Context check: {} restored messages, estimated {} tokens, max {} tokens, should_collapse={}",
                                        db_messages.len(),
                                        estimated_tokens,
                                        max_tokens,
                                        should_collapse
                                    );

                                    if should_collapse {
                                        let (collapsed_messages, collapse_state) = collapse_context(
                                            db_messages,
                                            max_tokens,
                                            CollapseStrategy::DropOldest
                                        );

                                        if let Some(state) = collapse_state {
                                            log::warn!(
                                                "⚠️ Context collapsed for session {}: dropped {} messages, {} tokens -> {} tokens",
                                                session_id,
                                                state.messages_dropped,
                                                state.tokens_before,
                                                state.tokens_after
                                            );
                                        }

                                        collapsed_messages
                                    } else {
                                        log::info!(
                                            "Context collapse skipped for session {}: restored history already under token threshold",
                                            session_id
                                        );
                                        db_messages
                                    }
                                } else {
                                    // No messages in DB, try file storage
                                    storage.load_messages(&session_id)
                                        .map(|msgs| {
                                            let (trimmed_msgs, total_messages) = trim_stored_messages(msgs);
                                            log::info!(
                                                "Loaded {} messages from file storage for session {} ({} total persisted, restore limit {})",
                                                trimmed_msgs.len(),
                                                session_id,
                                                total_messages,
                                                latest_message_limit
                                            );
                                            trimmed_msgs.into_iter()
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
                                let (trimmed_msgs, total_messages) = trim_stored_messages(storage.load_messages(&session_id).unwrap_or_default());
                                log::info!(
                                    "Loaded {} messages from file storage fallback for session {} ({} total persisted, restore limit {})",
                                    trimmed_msgs.len(),
                                    session_id,
                                    total_messages,
                                    latest_message_limit
                                );
                                trimmed_msgs
                                    .into_iter()
                                    .map(|m| if m.role == "user" { Message::user(m.content) } else { Message::assistant(m.content) })
                                    .collect()
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to prepare statement: {}, trying file storage", e);
                        let (trimmed_msgs, total_messages) = trim_stored_messages(storage.load_messages(&session_id).unwrap_or_default());
                        log::info!(
                            "Loaded {} messages from file storage fallback for session {} ({} total persisted, restore limit {})",
                            trimmed_msgs.len(),
                            session_id,
                            total_messages,
                            latest_message_limit
                        );
                        trimmed_msgs
                            .into_iter()
                            .map(|m| if m.role == "user" { Message::user(m.content) } else { Message::assistant(m.content) })
                            .collect()
                    }
                }
            } else {
                log::warn!("Failed to get database connection, trying file storage");
                let (trimmed_msgs, total_messages) = trim_stored_messages(storage.load_messages(&session_id).unwrap_or_default());
                log::info!(
                    "Loaded {} messages from file storage fallback for session {} ({} total persisted, restore limit {})",
                    trimmed_msgs.len(),
                    session_id,
                    total_messages,
                    latest_message_limit
                );
                trimmed_msgs
                    .into_iter()
                    .map(|m| if m.role == "user" { Message::user(m.content) } else { Message::assistant(m.content) })
                    .collect()
            }
        } else {
            log::warn!("Database pool unavailable, trying file storage");
            let (trimmed_msgs, total_messages) = trim_stored_messages(storage.load_messages(&session_id).unwrap_or_default());
            log::info!(
                "Loaded {} messages from file storage fallback for session {} ({} total persisted, restore limit {})",
                trimmed_msgs.len(),
                session_id,
                total_messages,
                latest_message_limit
            );
            trimmed_msgs
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

        // 检测是否已有用户消息，如果有则标记为 system prompt 已经由 claurst query config 处理
        let has_user_message = messages.iter().any(|message| matches!(message.role, claurst_core::types::Role::User));
        let role_prompt_prepended = has_user_message;

        if role_prompt_prepended {
            log::info!(
                "🔗 [ROLE_PROMPT] Restored session already has user history, treating system prompt as already established: session_id={} message_count={} restored_user_messages={}",
                session_id,
                messages.len(),
                messages.iter().filter(|message| matches!(message.role, claurst_core::types::Role::User)).count()
            );
        }

        Ok(Self {
            session_id,
            working_dir,
            api_key,
            model: query_config.model.clone(),
            base_url: provider_base_url,
            system_prompt,  // 直接使用传入的 system_prompt，不再从 query_config 获取
            role_prompt_prepended,  // 根据是否有消息来设置
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

        // 检测是否为第一条用户消息，仅用于诊断日志
        let is_first_user_message = !self.role_prompt_prepended;

        if is_first_user_message {
            log::info!(
                "🔗 [MESSAGE_PREPEND] First user message detected, relying on claurst system prompt path: request_id={} session_id={} has_system_prompt={}",
                request_id,
                self.session_id,
                self.system_prompt.is_some()
            );
        } else {
            log::info!(
                "🔗 [MESSAGE_PREPEND] Existing user history detected, no special first-turn prompt injection needed: request_id={} session_id={} role_prompt_prepended=true",
                request_id,
                self.session_id
            );
        }

        let actual_message = message.to_string();

        self.role_prompt_prepended = true;

        log::info!(
            "claurst_request_user_message_prepared request_id={} session_id={} raw_user_chars={} runtime_user_chars={} prompt_configured={} first_user_message={} is_task_session={}",
            request_id,
            self.session_id,
            message.chars().count(),
            actual_message.chars().count(),
            self.system_prompt.is_some(),
            is_first_user_message,
            task_session
        );

        // 1. 添加用户消息（仅使用原始用户消息）
        self.messages.push(Message::user(actual_message.clone()));
        if let Some(trace) = task_trace.as_ref() {
            log::info!(
                "claurst_request_user_message_saved request_id={} session_id={} task_id={} role_id={} role_name={} total_messages={} message_chars={}",
                request_id,
                self.session_id,
                trace.task_id,
                trace.role_id,
                trace.role_name,
                self.messages.len(),
                actual_message.chars().count()
            );
        } else {
            log::info!(
                "claurst_request_user_message_saved request_id={} session_id={} total_messages={} message_chars={}",
                request_id,
                self.session_id,
                self.messages.len(),
                actual_message.chars().count()
            );
        }

        // 保存用户消息到存储（仅保存原始用户消息）
        save_message_to_file_storage(
            &self.storage,
            &self.session_id,
            StoredMessage {
                role: "user".to_string(),
                content: actual_message.clone(),
                timestamp: chrono::Utc::now().timestamp(),
                timeline: None, // User messages don't have timeline
            },
            task_session,
            "user",
        );

        // Also save to database（仅保存原始用户消息）
        if let Ok(pool) = crate::database::get_pool() {
            if let Ok(conn) = pool.get() {
                let msg_id = format!("msg-{}", uuid::Uuid::new_v4());
                let created_at = chrono::Utc::now().to_rfc3339();
                let _ = conn.execute(
                    "INSERT INTO messages (id, session_id, role, content, created_at, request_id, is_streaming)
                     VALUES (?1, ?2, 'user', ?3, ?4, ?5, 0)",
                    rusqlite::params![&msg_id, &self.session_id, &actual_message, &created_at, request_id],
                );

                // Update session title if this is the first user message
                let message_count: i32 = conn.query_row(
                    "SELECT COUNT(*) FROM messages WHERE session_id = ?1 AND role = 'user'",
                    rusqlite::params![&self.session_id],
                    |row| row.get(0),
                ).unwrap_or(0);

                if message_count == 1 {
                    // 使用原始消息生成标题（不包含角色提示词）
                    let title = generate_title(message);
                    let _ = conn.execute(
                        "UPDATE sessions SET name = ?1, updated_at = ?2 WHERE id = ?3",
                        rusqlite::params![&title, &created_at, &self.session_id],
                    );
                    // Notify frontend so session list and header title update immediately
                    let _ = window.emit("session-title-updated", serde_json::json!({
                        "session_id": &self.session_id,
                        "title": &title,
                    }));
                }
            }
        }

        let timestamp = chrono::Utc::now().timestamp_millis();
        let _ = window.emit("ai-request-start", serde_json::json!({
            "request_id": request_id,
            "session_id": self.session_id.clone(),
            "timestamp": timestamp,
        }));
        emit_lifecycle_event(
            &window,
            request_id,
            &self.session_id,
            "thinking",
            status_label_for_phase("thinking"),
            "request_start",
        );
        emit_display_status(&window, request_id, "thinking", "思考中");

        // 2. 创建事件通道
        let (event_tx, mut event_rx) = mpsc::unbounded_channel();

        // 3. 启动事件处理任务
        let event_window = window.clone();
        let request_id_owned = request_id.to_string();
        let event_request_id = request_id_owned.clone();
        let event_session_id = self.session_id.clone();
        let event_task_trace = task_trace.clone();
        let terminal_warnings = Arc::new(parking_lot::Mutex::new(Vec::<Value>::new()));
        let event_warnings = terminal_warnings.clone();
        let first_event_logged = Arc::new(parking_lot::Mutex::new(false));
        let event_first_event_logged = first_event_logged.clone();
        let event_max_turns = self.config.max_turns;
        let diagnostic_context = CompletedToolOnlyDiagnosticContext {
            tool_sequence: Arc::new(parking_lot::Mutex::new(Vec::new())),
            turn_summaries: Arc::new(parking_lot::Mutex::new(Vec::new())),
        };
        let event_tool_sequence = diagnostic_context.tool_sequence.clone();
        let event_turn_summaries = diagnostic_context.turn_summaries.clone();
        let accumulated_visible_text = Arc::new(parking_lot::Mutex::new(String::new()));
        let event_accumulated_visible_text = accumulated_visible_text.clone();

        // 连续纯工具轮次检测：连续 N 轮 tool_use 且无文字输出时，触发强制收敛警告
        let consecutive_tool_only_turns = Arc::new(std::sync::atomic::AtomicU32::new(0));
        let event_consecutive_tool_only_turns = consecutive_tool_only_turns.clone();
        // 超过此阈值时打印明确警告日志，帮助定位失控工具链
        const CONSECUTIVE_TOOL_ONLY_WARN_THRESHOLD: u32 = 8;

        // Timeline data collection
        let timeline_items = Arc::new(parking_lot::Mutex::new(Vec::<TimelineItemData>::new()));
        let event_timeline_items = timeline_items.clone();
        tokio::spawn(async move {
            let mut has_emitted_streaming = false;
            while let Some(event) = event_rx.recv().await {
                let event_kind = match &event {
                    QueryEvent::Stream(_) => "stream",
                    QueryEvent::ToolStart { .. } => "tool_start",
                    QueryEvent::ToolEnd { .. } => "tool_end",
                    QueryEvent::TurnComplete { .. } => "turn_complete",
                    QueryEvent::Status(_) => "status",
                    QueryEvent::TokenWarning { .. } => "token_warning",
                    QueryEvent::Error(_) => "error",
                };

                {
                    let mut first_event_seen = event_first_event_logged.lock();
                    if !*first_event_seen {
                        *first_event_seen = true;
                        if let Some(trace) = event_task_trace.as_ref() {
                            log::info!(
                                "claurst_request_first_event request_id={} session_id={} task_id={} role_id={} role_name={} first_event={}",
                                event_request_id,
                                event_session_id,
                                trace.task_id,
                                trace.role_id,
                                trace.role_name,
                                event_kind
                            );
                        } else {
                            log::info!(
                                "claurst_request_first_event request_id={} session_id={} first_event={}",
                                event_request_id,
                                event_session_id,
                                event_kind
                            );
                        }
                    }
                }

                match event {
                    QueryEvent::Stream(stream_event) => {
                        use claurst_api::{streaming::ContentDelta, AnthropicStreamEvent};

                        match stream_event {
                            AnthropicStreamEvent::ContentBlockStart { content_block, .. } => {
                                // Handle thinking and visible text block starts with stable IDs
                                if let ContentBlock::Thinking { thinking, .. } = content_block {
                                    let timestamp = chrono::Utc::now().timestamp_millis();
                                    let item_id = format!("thinking-{}", uuid::Uuid::new_v4());
                                    log::info!("💭 [ContentBlockStart] Thinking block received, length={} chars", thinking.len());

                                    let item = TimelineItemData::thinking(item_id.clone(), timestamp, thinking.clone());
                                    event_timeline_items.lock().push(item);

                                    let _ = event_window.emit("thinking-chunk", serde_json::json!({
                                        "request_id": event_request_id,
                                        "item_id": item_id,
                                        "timestamp": timestamp,
                                        "chunk": thinking,
                                    }));
                                } else if let ContentBlock::Text { text } = content_block {
                                    let timestamp = chrono::Utc::now().timestamp_millis();
                                    let item_id = format!("output-{}", uuid::Uuid::new_v4());
                                    log::info!("📝 [ContentBlockStart] Text block received, length={} chars", text.len());

                                    if !text.is_empty() {
                                        let item = TimelineItemData::output(item_id.clone(), timestamp, text.clone());
                                        event_timeline_items.lock().push(item);

                                        let mut acc = event_accumulated_visible_text.lock();
                                        acc.push_str(&text);
                                        drop(acc);

                                        if !has_emitted_streaming {
                                            has_emitted_streaming = true;
                                            emit_lifecycle_event(
                                                &event_window,
                                                &event_request_id,
                                                &event_session_id,
                                                "streaming",
                                                status_label_for_phase("streaming"),
                                                "stream_first_chunk",
                                            );
                                        }

                                        let _ = event_window.emit("message-chunk", serde_json::json!({
                                            "request_id": event_request_id.clone(),
                                            "item_id": item_id,
                                            "timestamp": timestamp,
                                            "chunk": text,
                                        }));
                                    }
                                }
                            }
                            AnthropicStreamEvent::ContentBlockDelta { delta, .. } => {
                                match delta {
                                    ContentDelta::ThinkingDelta { thinking } => {
                                        if !thinking.is_empty() {
                                            let timestamp = chrono::Utc::now().timestamp_millis();
                                            let mut items = event_timeline_items.lock();
                                            if let Some(last_item) = items.last_mut() {
                                                if last_item.item_type == "thinking" {
                                                    if let Some(ref mut content) = last_item.content {
                                                        content.push_str(&thinking);
                                                    }

                                                    let _ = event_window.emit("thinking-chunk", serde_json::json!({
                                                        "request_id": event_request_id,
                                                        "item_id": last_item.id.clone(),
                                                        "timestamp": timestamp,
                                                        "chunk": thinking,
                                                    }));
                                                }
                                            }
                                        }
                                    }
                                    ContentDelta::TextDelta { text } => {
                                        let filtered_text = filter_system_tags(&text);

                                        log::info!(
                                            "🔤 [TextDelta] request_id={} original_len={} filtered_len={} filtered_chars={}",
                                            event_request_id,
                                            text.len(),
                                            filtered_text.len(),
                                            filtered_text.chars().count()
                                        );

                                        if !filtered_text.is_empty() {
                                            let timestamp = chrono::Utc::now().timestamp_millis();
                                            let mut acc = event_accumulated_visible_text.lock();
                                            let before_len = acc.len();
                                            let before_chars = acc.chars().count();
                                            acc.push_str(&filtered_text);
                                            let after_len = acc.len();
                                            let after_chars = acc.chars().count();
                                            drop(acc);

                                            log::info!(
                                                "📝 [Accumulate] request_id={} chunk_len={} chunk_chars={} accumulated_before={} accumulated_before_chars={} accumulated_after={} accumulated_after_chars={}",
                                                event_request_id,
                                                filtered_text.len(),
                                                filtered_text.chars().count(),
                                                before_len,
                                                before_chars,
                                                after_len,
                                                after_chars
                                            );

                                            if !has_emitted_streaming {
                                                has_emitted_streaming = true;
                                                emit_lifecycle_event(
                                                    &event_window,
                                                    &event_request_id,
                                                    &event_session_id,
                                                    "streaming",
                                                    status_label_for_phase("streaming"),
                                                    "stream_first_chunk",
                                                );
                                            }
                                            log::info!("📤 [Streaming] Sending message-chunk, request_id={}, chunk_len={} chars (original: {} chars)",
                                                event_request_id, filtered_text.len(), text.len());

                                            let mut items = event_timeline_items.lock();
                                            let output_item_id = if let Some(last_item) = items.last_mut() {
                                                if last_item.item_type == "output" {
                                                    if let Some(ref mut content) = last_item.content {
                                                        content.push_str(&filtered_text);
                                                    }
                                                    last_item.id.clone()
                                                } else {
                                                    let item_id = format!("output-{}", uuid::Uuid::new_v4());
                                                    items.push(TimelineItemData::output(item_id.clone(), timestamp, filtered_text.clone()));
                                                    item_id
                                                }
                                            } else {
                                                let item_id = format!("output-{}", uuid::Uuid::new_v4());
                                                items.push(TimelineItemData::output(item_id.clone(), timestamp, filtered_text.clone()));
                                                item_id
                                            };
                                            drop(items);

                                            let _ = event_window.emit("message-chunk", serde_json::json!({
                                                "request_id": event_request_id.clone(),
                                                "item_id": output_item_id,
                                                "timestamp": timestamp,
                                                "chunk": filtered_text,
                                            }));
                                        }
                                    }
                                    _ => {}
                                }
                            }
                            _ => {}
                        }
                    }
                    QueryEvent::ToolStart { tool_name, tool_id, input_json } => {
                        let tool_sequence_index = {
                            let mut tool_sequence = event_tool_sequence.lock();
                            tool_sequence.push(serde_json::json!({
                                "event": "tool_start",
                                "tool": tool_name,
                                "success": Value::Null,
                                "result_chars": Value::Null,
                            }));
                            tool_sequence.len() - 1
                        };

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

                        log::debug!(
                            "claurst_tool_sequence_marker request_id={} session_id={} index={} event=tool_start tool={}",
                            event_request_id,
                            event_session_id,
                            tool_sequence_index,
                            tool_name
                        );

                        emit_lifecycle_event(
                            &event_window,
                            &event_request_id,
                            &event_session_id,
                            "tool_running",
                            status_label_for_phase("tool_running"),
                            "tool_start",
                        );

                        // Generate a more descriptive action based on tool parameters
                        let description = generate_tool_description(&tool_name, &input_json);
                        emit_display_status(&event_window, &event_request_id, "tool_running", &description);
                        let timestamp = chrono::Utc::now().timestamp_millis();
                        let _ = event_window.emit("tool-call-start", serde_json::json!({
                            "request_id": event_request_id.clone(),
                            "tool": tool_name,
                            "tool_use_id": tool_id,
                            "action": description,
                            "input": input_json,
                            "item_id": format!("tool-{}", tool_id),
                            "timestamp": timestamp,
                        }));

                        // Collect timeline data for tool call start
                        let item = TimelineItemData::tool_call(
                            format!("tool-{}", tool_id),
                            timestamp,
                            tool_name.clone(),
                            description,
                            tool_id.clone(),
                        );
                        event_timeline_items.lock().push(item);
                    }
                    QueryEvent::ToolEnd { tool_name, tool_id, result, is_error } => {
                        let result_chars = result.chars().count();
                        let result_preview = result
                            .chars()
                            .take(120)
                            .collect::<String>()
                            .replace('\n', "\\n");
                        let tool_sequence_index = {
                            let mut tool_sequence = event_tool_sequence.lock();
                            tool_sequence.push(serde_json::json!({
                                "event": "tool_end",
                                "tool": tool_name,
                                "success": !is_error,
                                "result_chars": result_chars,
                                "result_preview": result_preview,
                            }));
                            tool_sequence.len() - 1
                        };

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
                                result_chars
                            );
                        } else {
                            log::info!(
                                "claurst_tool_end request_id={} session_id={} tool={} success={} result_chars={}",
                                event_request_id,
                                event_session_id,
                                tool_name,
                                !is_error,
                                result_chars
                            );
                        }

                        log::debug!(
                            "claurst_tool_sequence_marker request_id={} session_id={} index={} event=tool_end tool={} success={} result_chars={}",
                            event_request_id,
                            event_session_id,
                            tool_sequence_index,
                            tool_name,
                            !is_error,
                            result_chars
                        );

                        if is_error {
                            log::error!("Tool '{}' failed with error: {}", tool_name, result);
                        } else {
                            log::info!("Tool '{}' completed successfully", tool_name);
                        }

                        let timestamp = chrono::Utc::now().timestamp_millis();
                        let _ = event_window.emit("tool-call-end", serde_json::json!({
                            "request_id": event_request_id.clone(),
                            "tool": tool_name,
                            "tool_use_id": tool_id,
                            "success": !is_error,
                            "result": result,
                            "item_id": format!("tool-{}", tool_id),
                            "timestamp": timestamp,
                        }));
                        emit_lifecycle_event(
                            &event_window,
                            &event_request_id,
                            &event_session_id,
                            "thinking",
                            status_label_for_phase("thinking"),
                            "tool_end",
                        );
                        emit_display_status(&event_window, &event_request_id, "thinking", "工具执行完成，继续处理中");

                        // Update timeline data for tool call end
                        let mut items = event_timeline_items.lock();
                        if let Some(item) = items.iter_mut().find(|i| i.tool_use_id.as_ref() == Some(&tool_id)) {
                            item.status = Some(if is_error { "error" } else { "success" }.to_string());
                            item.result = Some(result.clone());
                        }
                    }
                    QueryEvent::TurnComplete { turn, stop_reason, usage, .. } => {
                        // Log accumulated text length at turn complete
                        let accumulated_len = event_accumulated_visible_text.lock().len();
                        log::info!(
                            "🔄 [TurnComplete] request_id={} turn={} stop_reason={} accumulated_text_len={}",
                            event_request_id,
                            turn,
                            stop_reason,
                            accumulated_len
                        );

                        // 连续纯工具轮次检测
                        if stop_reason == "tool_use" && accumulated_len == 0 {
                            let count = event_consecutive_tool_only_turns.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                            if count >= CONSECUTIVE_TOOL_ONLY_WARN_THRESHOLD {
                                log::warn!(
                                    "⚠️ [TOOL_LOOP_WARNING] request_id={} session_id={} consecutive_tool_only_turns={} turn={} — model has been running tools without any text output for {} consecutive turns. This may indicate an uncontrolled tool loop.",
                                    event_request_id,
                                    event_session_id,
                                    count,
                                    turn,
                                    count
                                );
                                let now = chrono::Utc::now().timestamp_millis();
                                let _ = event_window.emit("ai-tool-loop-warning", serde_json::json!({
                                    "request_id": event_request_id,
                                    "session_id": event_session_id,
                                    "consecutive_tool_only_turns": count,
                                    "current_turn": turn,
                                    "timestamp": now,
                                }));
                            }
                        } else {
                            // 只要本轮有可见文字输出，就重置计数
                            if accumulated_len > 0 {
                                event_consecutive_tool_only_turns.store(0, std::sync::atomic::Ordering::Relaxed);
                            }
                        }

                        {
                            let mut turn_summaries = event_turn_summaries.lock();
                            let turn_index = turn_summaries.len();
                            turn_summaries.push(serde_json::json!({
                                "turn_index": turn_index,
                                "stop_reason": stop_reason,
                                "usage_present": usage.is_some(),
                            }));
                        }
                        if let Some(trace) = event_task_trace.as_ref() {
                            log::info!(
                                "claurst_turn_complete request_id={} session_id={} task_id={} role_id={} role_name={} turn={} stop_reason={} usage_present={}",
                                event_request_id,
                                event_session_id,
                                trace.task_id,
                                trace.role_id,
                                trace.role_name,
                                turn,
                                stop_reason,
                                usage.is_some()
                            );
                        } else {
                            log::info!(
                                "claurst_turn_complete request_id={} session_id={} turn={} stop_reason={} usage_present={}",
                                event_request_id,
                                event_session_id,
                                turn,
                                stop_reason,
                                usage.is_some()
                            );
                        }

                        // Emit turn progress to frontend
                        log::info!(
                            "📊 [TurnProgress] Emitting ai-turn-progress event: request_id={} turn={}/{}",
                            event_request_id,
                            turn,
                            event_max_turns
                        );
                        let _ = event_window.emit("ai-turn-progress", serde_json::json!({
                            "requestId": event_request_id,
                            "sessionId": event_session_id,
                            "currentTurn": turn,
                            "maxTurns": event_max_turns,
                        }));

                        if let Some(usage) = usage.as_ref() {
                            emit_usage_event(
                                &event_window,
                                &event_request_id,
                                &event_session_id,
                                "current_turn",
                                usage,
                            );
                        }
                    }
                    QueryEvent::Status(status) => {
                        emit_display_status(&event_window, &event_request_id, infer_phase_from_status(&status), &status);
                    }
                    QueryEvent::TokenWarning { state, pct_used } => {
                        let now = chrono::Utc::now().timestamp_millis();
                        let warning_message = format!("Token usage warning: {:?} ({:.1}% used)", state, pct_used * 100.0);
                        event_warnings.lock().push(warning_to_json("token_warning", warning_message.clone()));
                        log::warn!(
                            "claurst_token_warning request_id={} session_id={} state={:?} pct_used={:.3}",
                            event_request_id,
                            event_session_id,
                            state,
                            pct_used
                        );
                        let _ = event_window.emit("ai-token-warning", serde_json::json!({
                            "request_id": event_request_id.clone(),
                            "session_id": event_session_id.clone(),
                            "warning_type": "token_warning",
                            "message": warning_message,
                            "details": {
                                "state": format!("{:?}", state),
                                "pct_used": pct_used,
                            },
                            "timestamp": now,
                        }));

                        // If token usage is >= 70%, emit compact start event
                        if pct_used >= 0.7 {
                            log::info!(
                                "claurst_compact_triggered request_id={} session_id={} pct_used={:.3}",
                                event_request_id,
                                event_session_id,
                                pct_used
                            );
                            let _ = event_window.emit("ai-compact-start", serde_json::json!({
                                "request_id": event_request_id.clone(),
                                "session_id": event_session_id.clone(),
                                "pct_used": pct_used,
                                "timestamp": now,
                            }));
                        }
                    }
                    QueryEvent::Error(err) => {
                        log::error!("Query event error: {}", err);
                        emit_display_status(&event_window, &event_request_id, "finalizing", &format!("发生错误: {}", err));
                    }
                }
            }
        });

        // 4. 调用 run_query_loop
        if let Some(trace) = task_trace.as_ref() {
            log::info!(
                "claurst_request_begin request_id={} session_id={} task_id={} role_id={} role_name={} model={} working_dir={} prompt_source_type={} prompt_hash={} prompt_contract_version={} prompt_chars={} prompt_preview={} history_messages={} api_key_present={} base_url_present={}",
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
                self.messages.len(),
                !self.api_key.trim().is_empty(),
                self.base_url.is_some()
            );
            log::info!(
                "claurst_request_run_query_loop_enter request_id={} session_id={} task_id={} role_id={} role_name={} tool_count={} message_count={} role_prompt_prepended={} config_system_prompt_chars={}",
                request_id,
                self.session_id,
                trace.task_id,
                trace.role_id,
                trace.role_name,
                self.tools.len(),
                self.messages.len(),
                self.role_prompt_prepended,
                self.config.system_prompt.as_ref().map(|value| value.chars().count()).unwrap_or(0)
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
            log::info!(
                "claurst_request_run_query_loop_enter request_id={} session_id={} tool_count={} message_count={} role_prompt_prepended={} config_system_prompt_chars={}",
                request_id,
                self.session_id,
                self.tools.len(),
                self.messages.len(),
                self.role_prompt_prepended,
                self.config.system_prompt.as_ref().map(|value| value.chars().count()).unwrap_or(0)
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

        let first_event_seen = *first_event_logged.lock();

        // Log the complete message history after run_query_loop
        log::info!(
            "🔍 [AFTER_QUERY_LOOP] request_id={} total_messages={} messages_summary={:?}",
            request_id,
            self.messages.len(),
            self.messages.iter().enumerate().map(|(i, msg)| {
                let role = match msg.role {
                    claurst_core::Role::User => "user",
                    claurst_core::Role::Assistant => "assistant",
                };
                let content_summary = match &msg.content {
                    claurst_core::types::MessageContent::Text(text) => {
                        format!("Text(chars={})", text.chars().count())
                    }
                    claurst_core::types::MessageContent::Blocks(blocks) => {
                        let block_details: Vec<String> = blocks.iter().map(|block| {
                            match block {
                                claurst_core::types::ContentBlock::Text { text } => format!("Text(chars={})", text.chars().count()),
                                claurst_core::types::ContentBlock::ToolUse { name, .. } => format!("ToolUse({})", name),
                                claurst_core::types::ContentBlock::ToolResult { tool_use_id, .. } => format!("ToolResult({})", tool_use_id),
                                _ => format!("{:?}", block).split('{').next().unwrap_or("Unknown").to_string(),
                            }
                        }).collect();
                        format!("Blocks(count={}, details={:?})", blocks.len(), block_details)
                    }
                };
                format!("{}:{}:{}", i, role, content_summary)
            }).collect::<Vec<_>>()
        );

        if let Some(trace) = task_trace.as_ref() {
            log::info!(
                "claurst_request_run_query_loop_exit request_id={} session_id={} task_id={} role_id={} role_name={} first_event_seen={} outcome_discriminant={:?}",
                request_id,
                self.session_id,
                trace.task_id,
                trace.role_id,
                trace.role_name,
                first_event_seen,
                std::mem::discriminant(&outcome)
            );
        } else {
            log::info!(
                "claurst_request_run_query_loop_exit request_id={} session_id={} first_event_seen={} outcome_discriminant={:?}",
                request_id,
                self.session_id,
                first_event_seen,
                std::mem::discriminant(&outcome)
            );
        }

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
        let warnings_snapshot = terminal_warnings.lock().clone();
        match outcome {
            QueryOutcome::EndTurn { message, usage } => {
                // Log the complete message content structure
                let content_structure = match &message.content {
                    MessageContent::Text(text) => {
                        format!("Text(len={}, chars={})", text.len(), text.chars().count())
                    }
                    MessageContent::Blocks(blocks) => {
                        let block_details: Vec<String> = blocks.iter().map(|block| {
                            match block {
                                ContentBlock::Text { text } => format!("Text(len={}, chars={})", text.len(), text.chars().count()),
                                ContentBlock::ToolUse { id, name, .. } => format!("ToolUse(id={}, name={})", id, name),
                                ContentBlock::ToolResult { tool_use_id, .. } => format!("ToolResult(id={})", tool_use_id),
                                _ => format!("{:?}", block).split('{').next().unwrap_or("Unknown").to_string(),
                            }
                        }).collect();
                        format!("Blocks(count={}, details={:?})", blocks.len(), block_details)
                    }
                };
                log::info!(
                    "🔍 [MessageContent] request_id={} content_structure={}",
                    request_id_owned,
                    content_structure
                );

                let message_content_summary = summarize_message_content(&message.content);
                let assistant_messages = self
                    .messages
                    .iter()
                    .enumerate()
                    .filter(|(_, msg)| matches!(msg.role, claurst_core::Role::Assistant))
                    .collect::<Vec<_>>();
                let assistant_message_count = assistant_messages.len();
                let last_assistant_message_summary = assistant_messages
                    .last()
                    .map(|(_, msg)| summarize_message_content(&msg.content));
                let recent_assistant_message_summaries = assistant_messages
                    .iter()
                    .rev()
                    .take(3)
                    .map(|(index, msg)| serde_json::json!({
                        "message_index": index,
                        "summary": summarize_message_content(&msg.content),
                    }))
                    .collect::<Vec<_>>();
                let recent_tool_sequence = diagnostic_context
                    .tool_sequence
                    .lock()
                    .iter()
                    .rev()
                    .take(8)
                    .cloned()
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect::<Vec<_>>();
                let turn_summaries = diagnostic_context.turn_summaries.lock().clone();

                // DEBUG: Write raw message.content to file for inspection
                if let Ok(content_json) = serde_json::to_string_pretty(&message.content) {
                    let debug_file = format!("/tmp/ai_response_debug_{}.json", request_id_owned);
                    let _ = std::fs::write(&debug_file, content_json);
                    log::info!("🔍 [DEBUG] Wrote raw message.content to {}", debug_file);
                }

                let mut text = take_text_from_message_content(&message.content);

                // Filter out system tags from the final message content
                text = filter_system_tags(&text);

                let extracted_text_before_fallback = text.clone();
                let extracted_text_before_fallback_chars = extracted_text_before_fallback.chars().count();
                let extracted_text_before_fallback_preview = extracted_text_before_fallback
                    .chars()
                    .take(120)
                    .collect::<String>()
                    .replace('\n', "\\n");
                let extracted_text_was_empty = text.is_empty();

                // Log accumulated text length BEFORE reading it
                log::info!(
                    "🔍 [BeforeRead] request_id={} accumulated_text_len_in_arc={}",
                    request_id_owned,
                    accumulated_visible_text.lock().len()
                );

                // Use accumulated visible output if it has more content than extracted text
                let accumulated_text = accumulated_visible_text.lock().clone();
                let accumulated_char_count = accumulated_text.chars().count();
                let extracted_char_count = text.chars().count();
                let should_use_accumulated = accumulated_char_count > extracted_char_count;

                log::info!(
                    "📊 [Final] request_id={} accumulated_chars={} accumulated_bytes={} extracted_chars={} will_use_accumulated={}",
                    request_id_owned,
                    accumulated_char_count,
                    accumulated_text.len(),
                    extracted_char_count,
                    should_use_accumulated
                );

                if should_use_accumulated {
                    log::info!(
                        "Using accumulated streaming text (has more content): request_id={} accumulated_chars={} extracted_chars={}",
                        request_id_owned,
                        accumulated_char_count,
                        extracted_char_count
                    );
                    text = accumulated_text.clone();
                } else if extracted_text_was_empty {
                    text = "✓ 已完成工具执行".to_string();
                }

                // has_visible_text should be based on the final text after fallback, not the original extracted text
                let has_visible_text = !text.is_empty();
                let fallback_visible_text_used = extracted_text_was_empty;

                // Only check for handoff in task sessions
                let parsed_handoff = if task_session && has_visible_text {
                    extract_handoff_block(&text)
                } else {
                    None
                };

                log::debug!(
                    "handoff_block_extracted session_id={} is_task_session={} found={}",
                    self.session_id,
                    task_session,
                    parsed_handoff.is_some()
                );

                // IMPORTANT: Do NOT modify the text based on handoff detection
                // We only read handoff information, not modify the original message
                // The handoff suggestion will be handled separately by the frontend

                let handoff_suggestion = parsed_handoff
                    .and_then(|parsed| resolve_handoff_suggestion(&self.session_id, parsed));

                log::debug!(
                    "handoff_suggestion_resolved session_id={} resolved={}",
                    self.session_id,
                    handoff_suggestion.is_some()
                );

                // Diagnostic: log what the final message body looks like on end_turn.
                // This is the key data we need to understand abnormal stops.
                let has_tool_use_blocks = matches!(
                    &message.content,
                    MessageContent::Blocks(blocks) if blocks.iter().any(|b| matches!(b, ContentBlock::ToolUse { .. }))
                );
                let is_empty_blocks_body = matches!(
                    &message.content,
                    MessageContent::Blocks(blocks) if blocks.is_empty()
                );
                log::warn!(
                    "claurst_end_turn_diagnosis request_id={} session_id={} \
                     has_tool_use_blocks={} is_empty_blocks_body={} \
                     fallback_visible_text_used={} extracted_text_was_empty={} \
                     accumulated_char_count={} extracted_char_count={} \
                     final_text_preview={:?}",
                    request_id_owned,
                    self.session_id,
                    has_tool_use_blocks,
                    is_empty_blocks_body,
                    fallback_visible_text_used,
                    extracted_text_was_empty,
                    accumulated_char_count,
                    extracted_char_count,
                    text.chars().take(120).collect::<String>(),
                );

                let outcome = if handoff_suggestion.is_some() {
                    "handoff_ready"
                } else if has_visible_text {
                    "completed"
                } else {
                    "completed_tool_only"
                };
                let is_max_turns_hit = turn_summaries.len() as u32 >= self.config.max_turns;
                let reason_code = if handoff_suggestion.is_some() {
                    Some("handoff_detected")
                } else if is_max_turns_hit {
                    Some("max_turns")
                } else if has_visible_text {
                    None
                } else {
                    Some("tool_only_end_turn")
                };

                if outcome == "completed_tool_only" {
                    log::warn!(
                        "claurst_completed_tool_only_diagnostic request_id={} session_id={} first_event_seen={} assistant_message_count={} extracted_text_before_fallback_chars={} extracted_text_before_fallback_preview={} fallback_visible_text_used={} handoff_present={} turn_count={} message_content_summary={} last_assistant_message_summary={} recent_assistant_message_summaries={} recent_tool_sequence={} turn_summaries={}",
                        request_id_owned,
                        self.session_id,
                        first_event_seen,
                        assistant_message_count,
                        extracted_text_before_fallback_chars,
                        extracted_text_before_fallback_preview,
                        fallback_visible_text_used,
                        handoff_suggestion.is_some(),
                        turn_summaries.len(),
                        message_content_summary,
                        last_assistant_message_summary.clone().unwrap_or_else(|| serde_json::json!(null)),
                        serde_json::json!(recent_assistant_message_summaries),
                        serde_json::json!(recent_tool_sequence),
                        serde_json::json!(turn_summaries)
                    );
                }

                log::info!(
                    "AI response received, bytes: {}, chars: {}, has_visible_text={}, handoff_found={}",
                    text.len(),
                    text.chars().count(),
                    has_visible_text,
                    handoff_suggestion.is_some()
                );

                log::debug!(
                    "request_end_payload session_id={} request_id={} final_text_chars={} has_visible_text={} handoff_found={}",
                    self.session_id,
                    request_id_owned,
                    text.chars().count(),
                    has_visible_text,
                    handoff_suggestion.is_some()
                );

                // Save only visible output text to message content
                let content_to_save = if !accumulated_text.is_empty() {
                    accumulated_text.clone()
                } else {
                    text.clone()
                };

                // Only save assistant message if content is not empty
                if !content_to_save.trim().is_empty() {
                    // Convert timeline items to storage format
                    let timeline_items_vec = timeline_items.lock().clone();
                    let stored_timeline: Vec<crate::storage::StoredTimelineItem> = timeline_items_vec.iter().map(|item| {
                        crate::storage::StoredTimelineItem {
                            id: item.id.clone(),
                            item_type: item.item_type.clone(),
                            timestamp: item.timestamp,
                            content: item.content.clone(),
                            tool: item.tool.clone(),
                            action: item.action.clone(),
                            status: item.status.clone(),
                            result: item.result.clone(),
                            tool_use_id: item.tool_use_id.clone(),
                        }
                    }).collect();

                    // Save assistant message to storage and database
                    save_message_to_file_storage(
                        &self.storage,
                        &self.session_id,
                        StoredMessage {
                            role: "assistant".to_string(),
                            content: content_to_save.clone(),
                            timestamp: chrono::Utc::now().timestamp(),
                            timeline: Some(stored_timeline),
                        },
                        task_session,
                        "assistant",
                    );

                    // Also save to database
                    if let Ok(pool) = crate::database::get_pool() {
                        if let Ok(conn) = pool.get() {
                            let msg_id = format!("msg-{}", uuid::Uuid::new_v4());
                            let created_at = chrono::Utc::now().to_rfc3339();

                            // Insert message
                            let _ = conn.execute(
                                "INSERT INTO messages (id, session_id, role, content, created_at, request_id, is_streaming)
                                 VALUES (?1, ?2, 'assistant', ?3, ?4, ?5, 0)",
                                rusqlite::params![&msg_id, &self.session_id, &content_to_save, &created_at, &request_id_owned],
                            );

                            // Insert timeline items
                            let timeline_items_vec = timeline_items.lock().clone();
                            for item in timeline_items_vec {
                                if let Err(e) = conn.execute(
                                    "INSERT INTO timeline_items (id, message_id, type, timestamp, content, tool, action, status, result, tool_use_id)
                                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                                    rusqlite::params![
                                        &item.id,
                                        &msg_id,
                                        &item.item_type,
                                        &item.timestamp,
                                        &item.content,
                                        &item.tool,
                                        &item.action,
                                        &item.status,
                                        &item.result,
                                        &item.tool_use_id,
                                    ],
                                ) {
                                    log::error!("Failed to insert timeline item {}: {}", item.id, e);
                                }
                            }
                        }
                    }
                } else {
                    log::warn!("Skipping save of empty assistant message for request {}", request_id_owned);
                }

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

                emit_lifecycle_event(
                    &window,
                    &request_id_owned,
                    &self.session_id,
                    "finalizing",
                    status_label_for_phase("finalizing"),
                    "query_outcome_end_turn",
                );
                emit_display_status(&window, &request_id_owned, "finalizing", "整理最终回答");

                let terminal_payload = TerminalEventPayload {
                    result: "success",
                    outcome,
                    activity_phase_at_end: "finalizing",
                    reason_code,
                    error_message: None,
                    final_text: Some(text.clone()),
                    has_visible_text: Some(has_visible_text),
                    handoff_suggestion,
                    usage: Some(usage),
                    timeline: Some(timeline_items.lock().clone()),
                };

                {
                    let items = timeline_items.lock();
                    for item in items.iter() {
                        log::warn!(
                            "claurst_terminal_timeline_item request_id={} item_id={} item_type={} content_chars={}",
                            request_id_owned,
                            item.id,
                            item.item_type,
                            item.content.as_deref().map(|c| c.chars().count()).unwrap_or(0),
                        );
                    }
                }

                log::info!(
                    "claurst_terminal_payload_prepared request_id={} session_id={} outcome={} reason_code={} has_visible_text={} fallback_visible_text_used={} handoff_present={}",
                    request_id_owned,
                    self.session_id,
                    terminal_payload.outcome,
                    terminal_payload.reason_code.unwrap_or("none"),
                    terminal_payload.has_visible_text.unwrap_or(false),
                    fallback_visible_text_used,
                    terminal_payload.handoff_suggestion.is_some()
                );

                emit_terminal_event(
                    &window,
                    &request_id_owned,
                    &self.session_id,
                    &terminal_payload,
                    &warnings_snapshot,
                );

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

                emit_lifecycle_event(
                    &window,
                    &request_id_owned,
                    &self.session_id,
                    "finalizing",
                    status_label_for_phase("finalizing"),
                    "query_outcome_cancelled",
                );
                emit_display_status(&window, &request_id_owned, "finalizing", "整理最终回答");

                emit_terminal_event(
                    &window,
                    &request_id_owned,
                    &self.session_id,
                    &TerminalEventPayload {
                        result: "cancelled",
                        outcome: "cancelled",
                        activity_phase_at_end: "finalizing",
                        reason_code: Some("user_cancelled"),
                        error_message: None,
                        final_text: None,
                        has_visible_text: None,
                        handoff_suggestion: None,
                        usage: None,
                        timeline: None,
                    },
                    &warnings_snapshot,
                );
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

                emit_lifecycle_event(
                    &window,
                    &request_id_owned,
                    &self.session_id,
                    "finalizing",
                    status_label_for_phase("finalizing"),
                    "query_outcome_error",
                );
                emit_display_status(&window, &request_id_owned, "finalizing", &format!("发生错误: {}", e));

                emit_terminal_event(
                    &window,
                    &request_id_owned,
                    &self.session_id,
                    &TerminalEventPayload {
                        result: "error",
                        outcome: "error",
                        activity_phase_at_end: "finalizing",
                        reason_code: Some("provider_error"),
                        error_message: Some(e.to_string()),
                        final_text: None,
                        has_visible_text: None,
                        handoff_suggestion: None,
                        usage: None,
                        timeline: None,
                    },
                    &warnings_snapshot,
                );
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

                emit_lifecycle_event(
                    &window,
                    &request_id_owned,
                    &self.session_id,
                    "finalizing",
                    status_label_for_phase("finalizing"),
                    "query_outcome_budget_exceeded",
                );
                emit_display_status(&window, &request_id_owned, "finalizing", &message);

                emit_terminal_event(
                    &window,
                    &request_id_owned,
                    &self.session_id,
                    &TerminalEventPayload {
                        result: "error",
                        outcome: "budget_exceeded",
                        activity_phase_at_end: "finalizing",
                        reason_code: Some("budget_limit"),
                        error_message: Some(message.clone()),
                        final_text: None,
                        has_visible_text: None,
                        handoff_suggestion: None,
                        usage: None,
                        timeline: None,
                    },
                    &warnings_snapshot,
                );
                Err(anyhow::anyhow!("{}", message))
            }
            QueryOutcome::MaxTokens { partial_message, usage } => {
                let message = "Max tokens reached".to_string();
                let partial_text = take_text_from_message_content(&partial_message.content);
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

                emit_lifecycle_event(
                    &window,
                    &request_id_owned,
                    &self.session_id,
                    "finalizing",
                    status_label_for_phase("finalizing"),
                    "query_outcome_max_tokens",
                );
                emit_display_status(&window, &request_id_owned, "finalizing", &message);

                emit_terminal_event(
                    &window,
                    &request_id_owned,
                    &self.session_id,
                    &TerminalEventPayload {
                        result: "error",
                        outcome: "max_tokens",
                        activity_phase_at_end: "finalizing",
                        reason_code: Some("context_limit"),
                        error_message: Some(message.clone()),
                        final_text: Some(partial_text.clone()),
                        has_visible_text: Some(!partial_text.is_empty()),
                        handoff_suggestion: None,
                        usage: Some(usage),
                        timeline: None,
                    },
                    &warnings_snapshot,
                );
                Err(anyhow::anyhow!("Max tokens reached"))
            }
        }
    }

    pub fn get_working_dir(&self) -> &PathBuf {
        &self.working_dir
    }

    pub fn recreate(&self) -> anyhow::Result<Self> {
        let mut new_session = Self::new(
            self.session_id.clone(),
            self.working_dir.clone(),
            self.api_key.clone(),
            self.model.clone(),
            self.base_url.clone(),
            self.system_prompt.clone(),
        )?;

        // 如果原 session 已经拼接过角色提示词，新 session 也应该标记为已拼接
        // 因为消息历史中第一条用户消息已经包含了角色提示词
        new_session.role_prompt_prepended = self.role_prompt_prepended;

        Ok(new_session)
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

    #[test]
    fn extract_handoff_block_keeps_visible_text_for_unresolved_target() {
        let input = "请下一位继续推进。\n\n[HANDOFF]\nrecommended: yes\ntarget_role: Missing Role\nreason: 需要其他角色接手\ndraft_message: 请继续处理剩余工作。\n[/HANDOFF]";
        let parsed = extract_handoff_block(input).expect("should parse handoff block");

        assert_eq!(parsed.visible_text, "请下一位继续推进。");
        assert!(parsed.recommended);
        assert_eq!(parsed.target_role_name.as_deref(), Some("Missing Role"));
    }
}
