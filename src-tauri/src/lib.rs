mod commands;
mod claurst;
mod storage;

use commands::session::AppState;
use std::sync::Arc;
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(AppState {
      session: Arc::new(Mutex::new(None)),
    })
    .invoke_handler(tauri::generate_handler![
      commands::init_session,
      commands::get_session_state,
      commands::close_session,
      commands::send_message,
      commands::list_sessions,
      commands::delete_session,
      commands::clear_session,
      commands::load_messages,
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
