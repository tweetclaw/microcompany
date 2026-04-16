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
    pub active_request_id: Arc<Mutex<Option<String>>>,
}

#[tauri::command]
pub async fn init_session(
    working_dir: String,
    session_id: Option<String>,
    provider_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if !std::path::Path::new(&working_dir).exists() {
        return Err(format!("Directory does not exist: {}", working_dir));
    }

    let app_config = crate::config::AppConfig::load()
        .map_err(|e| format!("Failed to load config: {}", e))?;

    let storage = crate::storage::ConversationStorage::new()
        .map_err(|e| format!("Failed to create storage: {}", e))?;

    let (session_id, selected_provider) = if let Some(existing_session_id) = session_id {
        let session_data = storage.load_session(&existing_session_id)
            .map_err(|e| format!("Failed to load session: {}", e))?;

        if session_data.working_directory != working_dir {
            return Err("Session does not belong to the current working directory".to_string());
        }

        let resolved_provider_id = session_data
            .provider_id
            .clone()
            .unwrap_or_else(|| app_config.active_provider.clone());

        let provider = app_config.providers.iter()
            .find(|p| p.id == resolved_provider_id)
            .ok_or_else(|| format!("Provider '{}' not found in configuration", resolved_provider_id))?
            .clone();

        (existing_session_id, provider)
    } else {
        let resolved_provider_id = provider_id.unwrap_or_else(|| app_config.active_provider.clone());

        let provider = app_config.providers.iter()
            .find(|p| p.id == resolved_provider_id)
            .ok_or_else(|| format!("Provider '{}' not found in configuration", resolved_provider_id))?
            .clone();

        let created_session_id = storage.create_session(
            &std::path::PathBuf::from(&working_dir),
            Some(provider.id.clone()),
            Some(provider.name.clone()),
            Some(provider.model.clone()),
            provider.base_url.clone(),
        ).map_err(|e| format!("Failed to create session: {}", e))?;

        (created_session_id, provider)
    };

    if selected_provider.id != "ollama" && selected_provider.api_key.is_empty() {
        return Err(format!("API key not configured for provider '{}'", selected_provider.name));
    }

    let session = ClaurstSession::new(
        session_id.clone(),
        std::path::PathBuf::from(&working_dir),
        selected_provider.api_key.clone(),
        selected_provider.model.clone(),
        selected_provider.base_url.clone(),
    ).map_err(|e| format!("Failed to create session: {}", e))?;

    *state.session.lock().await = Some(session);
    *state.cancel_token.lock().await = None;
    *state.active_request_id.lock().await = None;

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
pub async fn list_sessions(working_dir: Option<String>) -> Result<Vec<crate::storage::SessionInfo>, String> {
    let storage = crate::storage::ConversationStorage::new()
        .map_err(|e| format!("Failed to create storage: {}", e))?;

    storage.list_all_sessions(working_dir.as_deref())
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
