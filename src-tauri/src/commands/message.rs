use tauri::{State, Window};
use crate::commands::session::AppState;

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

    // 发送消息
    session.send_message(&message, window)
        .await
        .map_err(|e| format!("Failed to send message: {}", e))
}
