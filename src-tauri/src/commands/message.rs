use serde::{Deserialize, Serialize};
use tauri::State;
use crate::commands::session::AppState;

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub async fn send_message(
    message: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let session = state.session.lock().map_err(|e| e.to_string())?;

    if !session.is_initialized {
        return Err("Session not initialized. Please select a working directory first.".to_string());
    }

    // Mock AI response for now
    // TODO: Integrate with Claurst for real AI responses
    let response = format!(
        "This is a mock response to: \"{}\"\n\n\
        I'm currently running in mock mode. To enable real AI responses, \
        we need to integrate with Claurst.\n\n\
        Working directory: {}",
        message,
        session.working_directory.as_ref().unwrap_or(&"None".to_string())
    );

    Ok(response)
}
