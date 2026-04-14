use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::claurst::ClaurstSession;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionState {
    pub working_directory: Option<String>,
    pub is_initialized: bool,
}

impl Default for SessionState {
    fn default() -> Self {
        Self {
            working_directory: None,
            is_initialized: false,
        }
    }
}

pub struct AppState {
    pub session: Arc<Mutex<Option<ClaurstSession>>>,
}

#[tauri::command]
pub async fn init_session(
    working_dir: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Validate directory exists
    if !std::path::Path::new(&working_dir).exists() {
        return Err(format!("Directory does not exist: {}", working_dir));
    }

    // Load API configuration
    let config = crate::commands::config::ApiConfig::load()
        .map_err(|e| format!("Failed to load config: {}", e))?;

    let api_key = config.anthropic_api_key
        .ok_or("API key not configured")?;

    // Create Claurst session
    let session = ClaurstSession::new(
        std::path::PathBuf::from(&working_dir),
        api_key,
        config.model,
        config.base_url,
    ).map_err(|e| format!("Failed to create session: {}", e))?;

    // Save session
    *state.session.lock().await = Some(session);

    Ok(())
}

#[tauri::command]
pub async fn get_session_state(
    state: State<'_, AppState>,
) -> Result<SessionState, String> {
    let session_guard = state.session.lock().await;

    if let Some(session) = session_guard.as_ref() {
        Ok(SessionState {
            working_directory: Some(session.get_working_dir().display().to_string()),
            is_initialized: true,
        })
    } else {
        Ok(SessionState::default())
    }
}

#[tauri::command]
pub async fn close_session(
    state: State<'_, AppState>,
) -> Result<(), String> {
    *state.session.lock().await = None;
    Ok(())
}
