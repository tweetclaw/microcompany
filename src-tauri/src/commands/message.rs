use tauri::{State, Window};
use crate::commands::session::AppState;
use tokio_util::sync::CancellationToken;

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

    // 创建新的取消令牌与请求 ID
    let cancel_token = CancellationToken::new();
    let request_id = uuid::Uuid::new_v4().to_string();
    *state.cancel_token.lock().await = Some(cancel_token.clone());
    *state.active_request_id.lock().await = Some(request_id.clone());

    // 发送消息
    let result = session.send_message(&message, &request_id, window, cancel_token.clone())
        .await
        .map_err(|e| format!("Failed to send message: {}", e));

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
    let _ = storage.save_message(&target_session_id, message);

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

    let cancel_token_guard = state.cancel_token.lock().await;
    if let Some(token) = cancel_token_guard.as_ref() {
        token.cancel();
        Ok(())
    } else {
        Err("No active message to cancel".to_string())
    }
}
