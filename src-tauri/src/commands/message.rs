use tauri::{State, Window};
use crate::commands::session::AppState;
use tokio_util::sync::CancellationToken;

#[tauri::command]
pub async fn send_message(
    message: String,
    state: State<'_, AppState>,
    window: Window,
) -> Result<String, String> {
    // 创建新的取消令牌
    let cancel_token = CancellationToken::new();
    *state.cancel_token.lock().await = Some(cancel_token.clone());

    // 获取会话的可变引用
    let mut session_guard = state.session.lock().await;
    let session = session_guard.as_mut()
        .ok_or("Session not initialized. Please select a working directory first.")?;

    // 发送消息
    let result = session.send_message(&message, window, cancel_token.clone())
        .await
        .map_err(|e| format!("Failed to send message: {}", e));

    // 清除取消令牌
    *state.cancel_token.lock().await = None;

    result
}

#[tauri::command]
pub async fn cancel_message(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let cancel_token_guard = state.cancel_token.lock().await;
    if let Some(token) = cancel_token_guard.as_ref() {
        token.cancel();
        Ok(())
    } else {
        Err("No active message to cancel".to_string())
    }
}
