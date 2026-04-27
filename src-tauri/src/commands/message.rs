use tauri::{State, Window};
use crate::commands::session::AppState;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone)]
struct TaskSessionTraceContext {
    task_id: String,
    role_id: String,
    role_name: String,
    handoff_enabled: bool,
    prompt_source_type: Option<String>,
    prompt_hash: Option<String>,
    prompt_contract_version: Option<String>,
}

fn load_task_session_trace_context(session_id: &str) -> Result<Option<TaskSessionTraceContext>, String> {
    let pool = crate::database::get_pool()
        .map_err(|e| format!("Failed to get database pool: {}", e))?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT s.task_id, s.role_id, r.name, r.handoff_enabled, r.prompt_source_type, r.prompt_hash, r.prompt_contract_version
         FROM sessions s
         JOIN roles r ON r.id = s.role_id
         WHERE s.id = ?1"
    ).map_err(|e| format!("Failed to prepare task session trace query: {}", e))?;

    stmt.query_row(
        rusqlite::params![session_id],
        |row| {
            Ok(TaskSessionTraceContext {
                task_id: row.get(0)?,
                role_id: row.get(1)?,
                role_name: row.get(2)?,
                handoff_enabled: row.get(3)?,
                prompt_source_type: row.get(4)?,
                prompt_hash: row.get(5)?,
                prompt_contract_version: row.get(6)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        _ => Err(format!("Failed to load task session trace context: {}", e)),
    })
}

#[tauri::command]
pub async fn send_message(
    message: String,
    state: State<'_, AppState>,
    window: Window,
) -> Result<String, String> {
    // 获取会话的可变引用
    let mut session_guard = state.session.lock().await;
    let session = session_guard.as_mut()
        .ok_or("Session not initialized. Please select a working directory first.")?;

    let session_id = session.get_session_id().to_string();
    let task_context = load_task_session_trace_context(&session_id)?;

    // 创建新的取消令牌与请求 ID
    let cancel_token = CancellationToken::new();
    let request_id = uuid::Uuid::new_v4().to_string();
    *state.cancel_token.lock().await = Some(cancel_token.clone());
    *state.active_request_id.lock().await = Some(request_id.clone());

    if let Some(context) = task_context.as_ref() {
        log::info!(
            "task_message_send_begin request_id={} session_id={} task_id={} role_id={} role_name={} handoff_enabled={} prompt_source_type={} prompt_hash={} prompt_contract_version={} message_chars={}",
            request_id,
            session_id,
            context.task_id,
            context.role_id,
            context.role_name,
            context.handoff_enabled,
            context.prompt_source_type.as_deref().unwrap_or("unknown"),
            context.prompt_hash.as_deref().unwrap_or("unknown"),
            context.prompt_contract_version.as_deref().unwrap_or("unknown"),
            message.chars().count()
        );
    } else {
        log::info!(
            "session_message_send_begin request_id={} session_id={} message_chars={}",
            request_id,
            session_id,
            message.chars().count()
        );
    }

    // 发送消息
    let result = session.send_message(&message, &request_id, window, cancel_token.clone())
        .await
        .map_err(|e| format!("Failed to send message: {}", e));

    match &result {
        Ok(response) => {
            if let Some(context) = task_context.as_ref() {
                log::info!(
                    "task_message_send_end request_id={} session_id={} task_id={} role_id={} role_name={} response_chars={}",
                    request_id,
                    session_id,
                    context.task_id,
                    context.role_id,
                    context.role_name,
                    response.chars().count()
                );
            } else {
                log::info!(
                    "session_message_send_end request_id={} session_id={} response_chars={}",
                    request_id,
                    session_id,
                    response.chars().count()
                );
            }
        }
        Err(error) => {
            if let Some(context) = task_context.as_ref() {
                log::error!(
                    "task_message_send_error request_id={} session_id={} task_id={} role_id={} role_name={} error={}",
                    request_id,
                    session_id,
                    context.task_id,
                    context.role_id,
                    context.role_name,
                    error
                );
            } else {
                log::error!(
                    "session_message_send_error request_id={} session_id={} error={}",
                    request_id,
                    session_id,
                    error
                );
            }
        }
    }

    // 清除取消令牌与活跃请求
    *state.cancel_token.lock().await = None;
    *state.active_request_id.lock().await = None;

    result
}

#[tauri::command]
pub async fn forward_message(
    target_session_id: String,
    message_content: String,
) -> Result<(), String> {
    let target_context = load_task_session_trace_context(&target_session_id)?;

    if let Some(context) = target_context.as_ref() {
        log::info!(
            "task_forward_begin target_session_id={} task_id={} role_id={} role_name={} handoff_enabled={} prompt_hash={} message_chars={}",
            target_session_id,
            context.task_id,
            context.role_id,
            context.role_name,
            context.handoff_enabled,
            context.prompt_hash.as_deref().unwrap_or("unknown"),
            message_content.chars().count()
        );
    } else {
        log::info!(
            "session_forward_begin target_session_id={} message_chars={}",
            target_session_id,
            message_content.chars().count()
        );
    }

    // Save to database (primary storage for task sessions)
    let pool = crate::database::get_pool()
        .map_err(|e| format!("Failed to get database pool: {}", e))?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let msg_id = format!("msg-{}", uuid::Uuid::new_v4());
    let created_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO messages (id, session_id, role, content, created_at, is_streaming)
         VALUES (?1, ?2, 'user', ?3, ?4, 0)",
        rusqlite::params![&msg_id, &target_session_id, &message_content, &created_at],
    ).map_err(|e| format!("Failed to save message to database: {}", e))?;

    // Also try to save to file storage (for normal sessions), but don't fail if session doesn't exist
    let storage = crate::storage::ConversationStorage::new()
        .map_err(|e| format!("Failed to create storage: {}", e))?;

    let now = chrono::Utc::now().timestamp();
    let message = crate::storage::StoredMessage {
        role: "user".to_string(),
        content: message_content.clone(),
        timestamp: now,
    };

    // Ignore errors for file storage - task sessions may not have file storage
    if let Err(error) = storage.save_message(&target_session_id, message) {
        log::warn!(
            "forward_file_storage_save_failed target_session_id={} error={}",
            target_session_id,
            error
        );
    }

    if let Some(context) = target_context.as_ref() {
        log::info!(
            "task_forward_end target_session_id={} task_id={} role_id={} role_name={} message_id={}",
            target_session_id,
            context.task_id,
            context.role_id,
            context.role_name,
            msg_id
        );
    } else {
        log::info!(
            "session_forward_end target_session_id={} message_id={}",
            target_session_id,
            msg_id
        );
    }

    Ok(())
}

#[tauri::command]
pub async fn cancel_message(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let active_request_id = state.active_request_id.lock().await.clone();
    if active_request_id.is_none() {
        return Err("No active message to cancel".to_string());
    }

    let request_id = active_request_id.unwrap_or_default();
    log::info!("message_cancel_requested request_id={}", request_id);

    let cancel_token_guard = state.cancel_token.lock().await;
    if let Some(token) = cancel_token_guard.as_ref() {
        token.cancel();
        log::info!("message_cancelled request_id={}", request_id);
        Ok(())
    } else {
        log::warn!("message_cancel_missing_token request_id={}", request_id);
        Err("No active message to cancel".to_string())
    }
}
