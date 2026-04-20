mod commands;
mod claurst;
mod storage;
mod config;
mod database;
mod api;

use commands::session::AppState;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::Manager;

#[tauri::command]
async fn initialize_database(app_handle: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let db_path = app_dir.join(".mc").join("data.db");
    let db_path_str = db_path.to_string_lossy().to_string();

    database::initialize_database(&db_path_str)?;
    database::pool::init_pool(&db_path_str)?;
    Ok(())
}

#[tauri::command]
async fn create_task(task: api::TaskCreateRequest) -> Result<api::Task, String> {
    api::create_task(task).await
}

#[tauri::command]
async fn get_task(task_id: String) -> Result<api::Task, String> {
    api::get_task(task_id).await
}

#[tauri::command]
async fn list_tasks() -> Result<Vec<api::TaskSummary>, String> {
    api::list_tasks().await
}

#[tauri::command]
async fn update_task(task_id: String, updates: api::TaskUpdateRequest) -> Result<api::Task, String> {
    api::update_task(task_id, updates).await
}

#[tauri::command]
async fn delete_task(task_id: String) -> Result<api::DeleteTaskResult, String> {
    api::delete_task(task_id).await
}

#[tauri::command]
async fn get_messages(
    session_id: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<api::Message>, String> {
    api::get_messages(session_id, limit, offset).await
}

#[tauri::command]
async fn save_message(message: api::MessageCreateRequest) -> Result<String, String> {
    api::save_message(message).await
}

#[tauri::command]
async fn update_message_content(
    message_id: String,
    content: String,
    is_streaming: bool,
) -> Result<(), String> {
    api::update_message_content(message_id, content, is_streaming).await
}

#[tauri::command]
async fn create_normal_session(
    name: String,
    model: String,
    provider: String,
    working_directory: String,
) -> Result<String, String> {
    api::create_normal_session(name, model, provider, working_directory).await
}

#[tauri::command]
async fn get_session(session_id: String) -> Result<api::Session, String> {
    api::get_session(session_id).await
}

#[tauri::command]
async fn list_normal_sessions() -> Result<Vec<api::SessionSummary>, String> {
    api::list_normal_sessions().await
}

#[tauri::command]
async fn delete_session_api(session_id: String) -> Result<api::DeleteSessionResult, String> {
    api::delete_session(session_id).await
}

#[tauri::command]
async fn search_messages(
    query: String,
    limit: Option<u32>,
) -> Result<Vec<api::MessageSearchResult>, String> {
    api::search_messages(query, limit).await
}

#[tauri::command]
async fn get_statistics() -> Result<api::Statistics, String> {
    api::get_statistics().await
}

#[tauri::command]
async fn get_task_statistics(task_id: String) -> Result<api::TaskStatistics, String> {
    api::get_task_statistics(task_id).await
}

#[tauri::command]
async fn create_backup(app_handle: tauri::AppHandle) -> Result<api::BackupInfo, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    api::create_backup(app_dir).await
}

#[tauri::command]
async fn list_backups(app_handle: tauri::AppHandle) -> Result<Vec<api::BackupInfo>, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    api::list_backups(app_dir).await
}

#[tauri::command]
async fn restore_backup(backup_path: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    api::restore_backup(backup_path, app_dir).await
}

#[tauri::command]
async fn vacuum_database(app_handle: tauri::AppHandle) -> Result<api::VacuumResult, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    api::vacuum_database(app_dir).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(AppState {
      session: Arc::new(Mutex::new(None)),
      cancel_token: Arc::new(Mutex::new(None)),
      active_request_id: Arc::new(Mutex::new(None)),
    })
    .invoke_handler(tauri::generate_handler![
      commands::init_session,
      commands::get_session_state,
      commands::close_session,
      commands::send_message,
      commands::forward_message,
      commands::cancel_message,
      commands::list_sessions,
      commands::delete_session,
      commands::clear_session,
      commands::load_messages,
      commands::get_config,
      commands::save_config,
      commands::get_available_providers,
      commands::validate_provider_config,
      initialize_database,
      create_task,
      get_task,
      list_tasks,
      update_task,
      delete_task,
      get_messages,
      save_message,
      update_message_content,
      create_normal_session,
      get_session,
      list_normal_sessions,
      delete_session_api,
      search_messages,
      get_statistics,
      get_task_statistics,
      create_backup,
      list_backups,
      restore_backup,
      vacuum_database,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
