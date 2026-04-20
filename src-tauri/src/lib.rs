mod commands;
mod claurst;
mod storage;
mod config;
mod database;

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
    Ok(())
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
      commands::save_task,
      commands::load_task,
      commands::list_tasks,
      commands::delete_task,
      initialize_database,
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
