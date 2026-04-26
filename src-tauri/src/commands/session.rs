use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::claurst::ClaurstSession;

fn load_task_session_prompt_snapshot(session_id: &str) -> Result<Option<String>, String> {
    let pool = crate::database::get_pool()
        .map_err(|e| format!("Failed to get database pool: {}", e))?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    conn.query_row(
        "SELECT r.system_prompt_snapshot
         FROM sessions s
         JOIN roles r ON r.id = s.role_id
         WHERE s.id = ?1",
        rusqlite::params![session_id],
        |row| row.get(0),
    )
    .map_err(|e| format!("Failed to load task session prompt snapshot: {}", e))
}

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

        // Also create database record for the session
        let pool = crate::database::get_pool()
            .map_err(|e| format!("Failed to get database pool: {}", e))?;
        let conn = pool.get()
            .map_err(|e| format!("Failed to get database connection: {}", e))?;

        let created_at = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO sessions (id, type, name, model, provider, working_directory, status, created_at, updated_at)
             VALUES (?1, 'normal', 'Untitled', ?2, ?3, ?4, 'initializing', ?5, ?5)",
            rusqlite::params![&created_session_id, &provider.model, &provider.id, &working_dir, &created_at],
        ).map_err(|e| format!("Failed to insert session into database: {}", e))?;

        (created_session_id, provider)
    };

    if selected_provider.id != "ollama" && selected_provider.api_key.is_empty() {
        return Err(format!("API key not configured for provider '{}'", selected_provider.name));
    }

    // 设置 Brave Search API Key 环境变量（如果配置了）
    if let Some(api_key) = &app_config.brave_search_api_key {
        if !api_key.is_empty() {
            std::env::set_var("BRAVE_SEARCH_API_KEY", api_key);
        }
    }

    let session = ClaurstSession::new(
        session_id.clone(),
        std::path::PathBuf::from(&working_dir),
        selected_provider.api_key.clone(),
        selected_provider.model.clone(),
        selected_provider.base_url.clone(),
        None,
    ).map_err(|e| format!("Failed to create session: {}", e))?;

    *state.session.lock().await = Some(session);
    *state.cancel_token.lock().await = None;
    *state.active_request_id.lock().await = None;

    // Update session status to 'ready' in database if this was a new session
    if session_id.starts_with("session-") {
        if let Ok(pool) = crate::database::get_pool() {
            if let Ok(conn) = pool.get() {
                let _ = conn.execute(
                    "UPDATE sessions SET status = 'ready' WHERE id = ?1",
                    rusqlite::params![&session_id],
                );
            }
        }
    }

    Ok(session_id)
}

#[tauri::command]
pub async fn init_task_session(
    session_id: String,
    model: String,
    provider: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let app_config = crate::config::AppConfig::load()
        .map_err(|e| format!("Failed to load config: {}", e))?;

    let provider_config = app_config.providers.iter()
        .find(|p| p.id == provider)
        .ok_or_else(|| format!("Provider '{}' not found in configuration", provider))?;

    if provider_config.id != "ollama" && provider_config.api_key.is_empty() {
        return Err(format!("API key not configured for provider '{}'", provider_config.name));
    }

    // 任务会话使用当前工作目录
    let working_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;

    let session = ClaurstSession::new(
        session_id.clone(),
        working_dir,
        provider_config.api_key.clone(),
        model,
        provider_config.base_url.clone(),
        load_task_session_prompt_snapshot(&session_id)?,
    ).map_err(|e| format!("Failed to create Claurst session: {}", e))?;

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
