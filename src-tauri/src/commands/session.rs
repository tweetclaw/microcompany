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
    pub cancel_token: Arc<Mutex<Option<tokio_util::sync::CancellationToken>>>,
}

#[tauri::command]
pub async fn init_session(
    working_dir: String,
    session_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Validate directory exists
    if !std::path::Path::new(&working_dir).exists() {
        return Err(format!("Directory does not exist: {}", working_dir));
    }

    // Load API configuration
    let app_config = crate::config::AppConfig::load()
        .map_err(|e| format!("Failed to load config: {}", e))?;

    // Get active provider configuration
    let active_provider = app_config.providers.iter()
        .find(|p| p.id == app_config.active_provider)
        .ok_or_else(|| format!("Active provider '{}' not found in configuration", app_config.active_provider))?;

    if active_provider.api_key.is_empty() {
        return Err(format!("API key not configured for provider '{}'", active_provider.name));
    }

    // Use provided session_id or create a new one
    let session_id = if let Some(id) = session_id {
        id
    } else {
        // Create a new session in storage
        let storage = crate::storage::ConversationStorage::new()
            .map_err(|e| format!("Failed to create storage: {}", e))?;
        storage.create_session(&std::path::PathBuf::from(&working_dir))
            .map_err(|e| format!("Failed to create session: {}", e))?
    };

    // Create Claurst session
    let session = ClaurstSession::new(
        session_id.clone(),
        std::path::PathBuf::from(&working_dir),
        active_provider.api_key.clone(),
        active_provider.model.clone(),
        active_provider.base_url.clone(),
    ).map_err(|e| format!("Failed to create session: {}", e))?;

    // Save session
    *state.session.lock().await = Some(session);

    Ok(session_id)
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

#[tauri::command]
pub async fn list_sessions() -> Result<Vec<crate::storage::SessionInfo>, String> {
    let storage = crate::storage::ConversationStorage::new()
        .map_err(|e| format!("Failed to create storage: {}", e))?;
    
    storage.list_all_sessions()
        .map_err(|e| format!("Failed to list sessions: {}", e))
}

#[tauri::command]
pub async fn delete_session(session_id: String) -> Result<(), String> {
    let storage = crate::storage::ConversationStorage::new()
        .map_err(|e| format!("Failed to create storage: {}", e))?;

    storage.delete_session(&session_id)
        .map_err(|e| format!("Failed to delete session: {}", e))
}

#[tauri::command]
pub async fn clear_session(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session_guard = state.session.lock().await;

    if let Some(session) = session_guard.as_ref() {
        let session_id = session.get_session_id();

        let storage = crate::storage::ConversationStorage::new()
            .map_err(|e| format!("Failed to create storage: {}", e))?;

        storage.clear_messages(session_id)
            .map_err(|e| format!("Failed to clear messages: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn load_messages(
    session_id: String,
) -> Result<Vec<crate::storage::StoredMessage>, String> {
    let storage = crate::storage::ConversationStorage::new()
        .map_err(|e| format!("Failed to create storage: {}", e))?;

    storage.load_messages(&session_id)
        .map_err(|e| format!("Failed to load messages: {}", e))
}
