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
