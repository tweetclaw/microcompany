use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::claurst::ClaurstSession;

#[derive(Debug, Clone)]
struct TaskSessionPromptContext {
    task_id: String,
    role_id: String,
    role_name: String,
    working_directory: Option<String>,
    prompt_snapshot: Option<String>,
    prompt_source_type: Option<String>,
    prompt_hash: Option<String>,
    prompt_contract_version: Option<String>,
}

fn load_task_session_prompt_context(session_id: &str) -> Result<Option<TaskSessionPromptContext>, String> {
    let pool = crate::database::get_pool()
        .map_err(|e| format!("Failed to get database pool: {}", e))?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT s.task_id, s.role_id, r.name, s.working_directory, r.system_prompt_snapshot, r.prompt_source_type, r.prompt_hash, r.prompt_contract_version
         FROM sessions s
         JOIN roles r ON r.id = s.role_id
         WHERE s.id = ?1"
    ).map_err(|e| format!("Failed to prepare task session prompt query: {}", e))?;

    stmt.query_row(
        rusqlite::params![session_id],
        |row| {
            Ok(TaskSessionPromptContext {
                task_id: row.get(0)?,
                role_id: row.get(1)?,
                role_name: row.get(2)?,
                working_directory: row.get(3)?,
                prompt_snapshot: row.get(4)?,
                prompt_source_type: row.get(5)?,
                prompt_hash: row.get(6)?,
                prompt_contract_version: row.get(7)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        _ => Err(format!("Failed to load task session prompt context: {}", e)),
    })
}

fn build_prompt_preview(prompt_snapshot: Option<&str>) -> String {
    const PREVIEW_LIMIT: usize = 120;

    prompt_snapshot
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            let preview: String = value.chars().take(PREVIEW_LIMIT).collect();
            preview.replace('\n', "\\n")
        })
        .unwrap_or_else(|| "none".to_string())
}

fn resolve_task_working_directory(context: Option<&TaskSessionPromptContext>) -> Result<std::path::PathBuf, String> {
    if let Some(path) = context
        .and_then(|value| value.working_directory.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(std::path::PathBuf::from(path));
    }

    let cwd = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;

    let repo_root = cwd
        .parent()
        .filter(|_| cwd.file_name().and_then(|name| name.to_str()) == Some("src-tauri"))
        .map(std::path::Path::to_path_buf)
        .unwrap_or_else(|| cwd.clone());

    log::warn!(
        "task_session_working_directory_missing stored_working_dir=none fallback_working_dir={}",
        repo_root.display()
    );

    Ok(repo_root)
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

    if let Some(api_key) = &app_config.brave_search_api_key {
        if !api_key.is_empty() {
            std::env::set_var("BRAVE_SEARCH_API_KEY", api_key);
        }
    }

    log::info!(
        "session_init_begin session_id={} type=normal provider={} model={} working_dir={}",
        session_id,
        selected_provider.id,
        selected_provider.model,
        working_dir
    );

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

    log::info!(
        "session_init_ready session_id={} type=normal provider={} model={}",
        session_id,
        selected_provider.id,
        selected_provider.model
    );

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

    let prompt_context = load_task_session_prompt_context(&session_id)?;
    let working_dir = resolve_task_working_directory(prompt_context.as_ref())?;
    let working_directory = working_dir.display().to_string();
    let prompt_preview = build_prompt_preview(
        prompt_context
            .as_ref()
            .and_then(|context| context.prompt_snapshot.as_deref())
    );
    let prompt_chars = prompt_context
        .as_ref()
        .and_then(|context| context.prompt_snapshot.as_ref())
        .map(|value| value.chars().count())
        .unwrap_or(0);

    if let Some(context) = prompt_context.as_ref() {
        log::info!(
            "task_session_init_prompt_loaded session_id={} task_id={} role_id={} role_name={} provider={} model={} working_dir={} prompt_source_type={} prompt_hash={} prompt_contract_version={} prompt_chars={} prompt_preview={}",
            session_id,
            context.task_id,
            context.role_id,
            context.role_name,
            provider,
            model,
            working_directory,
            context.prompt_source_type.as_deref().unwrap_or("unknown"),
            context.prompt_hash.as_deref().unwrap_or("unknown"),
            context.prompt_contract_version.as_deref().unwrap_or("unknown"),
            prompt_chars,
            prompt_preview
        );
    } else {
        log::warn!(
            "task_session_init_prompt_missing session_id={} provider={} model={}",
            session_id,
            provider,
            model
        );
    }

    let working_dir = resolve_task_working_directory(prompt_context.as_ref())?;

    log::info!(
        "task_session_init_begin session_id={} provider={} model={} working_dir={}",
        session_id,
        provider,
        model,
        working_dir.display()
    );

    let session = ClaurstSession::new(
        session_id.clone(),
        working_dir,
        provider_config.api_key.clone(),
        model,
        provider_config.base_url.clone(),
        prompt_context.and_then(|context| context.prompt_snapshot),
    ).map_err(|e| format!("Failed to create Claurst session: {}", e))?;

    *state.session.lock().await = Some(session);
    *state.cancel_token.lock().await = None;
    *state.active_request_id.lock().await = None;

    log::info!(
        "task_session_init_ready session_id={} provider={} model={}",
        session_id,
        provider,
        provider_config.model
    );

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
