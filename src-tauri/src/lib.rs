mod commands;
mod claurst;
mod storage;
mod config;
mod database;
mod api;
mod archetypes;

use commands::session::AppState;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::Manager;

#[tauri::command]
async fn initialize_database(app_handle: tauri::AppHandle) -> Result<(), String> {
    println!("[initialize_database] Starting database initialization...");

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| {
            let err_msg = format!("Failed to get app data directory: {}", e);
            println!("[initialize_database] ERROR: {}", err_msg);
            err_msg
        })?;

    println!("[initialize_database] App data directory: {:?}", app_dir);

    let db_path = app_dir.join(".mc").join("data.db");
    let db_path_str = db_path.to_string_lossy().to_string();

    println!("[initialize_database] Database path: {}", db_path_str);

    database::initialize_database(&db_path_str).map_err(|e| {
        let err_msg = format!("Failed to initialize database: {}", e);
        println!("[initialize_database] ERROR: {}", err_msg);
        err_msg
    })?;

    println!("[initialize_database] Database schema and connection pool initialized successfully");
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
async fn restart_task_role_session(task_id: String, role_id: String) -> Result<api::Task, String> {
    api::restart_task_role_session(task_id, role_id).await
}

#[tauri::command]
async fn get_team_brief(task_id: String) -> Result<api::TeamBrief, String> {
    api::get_team_brief(task_id).await
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

#[tauri::command]
async fn list_role_archetypes() -> Result<Vec<archetypes::RoleArchetype>, String> {
    archetypes::list_role_archetypes()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(AppState {
      session: Arc::new(Mutex::new(None)),
      cancel_token: Arc::new(Mutex::new(None)),
      active_request_id: Arc::new(Mutex::new(None)),
      cancelling_request_id: Arc::new(Mutex::new(None)),
    })
    .invoke_handler(tauri::generate_handler![
      commands::init_session,
      commands::init_task_session,
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
      restart_task_role_session,
      get_team_brief,
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
      list_role_archetypes,
    ])
    .setup(|app| {
      archetypes::sync_archetype_resources(app.handle())?;
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // VS Code-style window sizing for macOS Retina displays
      if let Some(window) = app.get_webview_window("main") {
        use tauri::LogicalSize;

        println!("[Window Setup] Starting VS Code-style window initialization...");

        // Get monitor info to calculate 75% screen size (VS Code style)
        let (logical_width, logical_height) = if let Ok(monitors) = window.available_monitors() {
          if let Some(monitor) = monitors.first() {
            let scale = monitor.scale_factor();
            let physical_width = monitor.size().width;
            let physical_height = monitor.size().height;

            // Calculate logical screen size
            let logical_screen_width = physical_width as f64 / scale;
            let logical_screen_height = physical_height as f64 / scale;

            // VS Code uses approximately 75% of screen size on first launch
            let width = (logical_screen_width * 0.75) as f64;
            let height = (logical_screen_height * 0.75) as f64;

            println!("[Window Setup] Monitor: {}x{} physical, {}x{} logical (scale: {})",
              physical_width, physical_height, logical_screen_width, logical_screen_height, scale);
            println!("[Window Setup] Target size (75% screen): {}x{} logical", width, height);

            (width, height)
          } else {
            (1080.0, 720.0) // Fallback
          }
        } else {
          (1080.0, 720.0) // Fallback
        };

        // Clone for async operations and event monitoring
        let window_clone = window.clone();
        let window_for_events = window.clone();
        let target_width = logical_width;
        let target_height = logical_height;

        // Add window event listeners to detect and correct unwanted resizing
        window.on_window_event(move |event| {
          match event {
            tauri::WindowEvent::Resized(size) => {
              if let Ok(is_maximized) = window_for_events.is_maximized() {
                if let Ok(scale) = window_for_events.scale_factor() {
                  let expected_physical_width = (target_width * scale) as u32;
                  let expected_physical_height = (target_height * scale) as u32;

                  // Allow 10 pixel tolerance for window decorations
                  let width_diff = (size.width as i32 - expected_physical_width as i32).abs();
                  let height_diff = (size.height as i32 - expected_physical_height as i32).abs();

                  if !is_maximized && (width_diff > 10 || height_diff > 10) {
                    println!("[Window Event] UNEXPECTED RESIZE: {}x{} (expected: {}x{}, scale: {}, maximized: {})",
                      size.width, size.height, expected_physical_width, expected_physical_height, scale, is_maximized);

                    // Correct the size back to target
                    let window_for_correction = window_for_events.clone();
                    tauri::async_runtime::spawn(async move {
                      tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                      if let Err(e) = window_for_correction.set_size(LogicalSize::new(target_width, target_height)) {
                        println!("[Window Event] ERROR: Failed to correct size: {}", e);
                      } else {
                        println!("[Window Event] Size corrected back to {}x{}", target_width, target_height);
                      }
                    });
                  } else {
                    println!("[Window Event] RESIZED: {}x{} (scale: {}, maximized: {})",
                      size.width, size.height, scale, is_maximized);
                  }
                }
              }
            }
            tauri::WindowEvent::Moved(position) => {
              if let Ok(is_maximized) = window_for_events.is_maximized() {
                println!("[Window Event] MOVED: ({}, {}) (maximized: {})",
                  position.x, position.y, is_maximized);
              }
            }
            _ => {}
          }
        });

        tauri::async_runtime::spawn(async move {
          // Wait for initial window creation
          tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

          println!("[Window Setup] Setting size and position...");

          // Set size using logical coordinates
          if let Err(e) = window_clone.set_size(LogicalSize::new(logical_width, logical_height)) {
            println!("[Window Setup] ERROR: Failed to set size: {}", e);
          }

          // Center the window
          if let Err(e) = window_clone.center() {
            println!("[Window Setup] ERROR: Failed to center: {}", e);
          }

          // Log state before show
          if let Ok(size) = window_clone.outer_size() {
            println!("[Window Setup] Size before show: {}x{}", size.width, size.height);
          }
          if let Ok(position) = window_clone.outer_position() {
            println!("[Window Setup] Position before show: ({}, {})", position.x, position.y);
          }

          // Show window
          tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
          println!("[Window Setup] Showing window...");
          if let Err(e) = window_clone.show() {
            println!("[Window Setup] ERROR: Failed to show: {}", e);
          }

          // Re-apply size and position after show to fight macOS corruption
          tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
          println!("[Window Setup] Re-applying size and position after show...");

          if let Err(e) = window_clone.set_size(LogicalSize::new(logical_width, logical_height)) {
            println!("[Window Setup] ERROR: Failed to re-set size: {}", e);
          }

          if let Err(e) = window_clone.center() {
            println!("[Window Setup] ERROR: Failed to re-center: {}", e);
          }

          // Final state with detailed logging
          if let Ok(size) = window_clone.outer_size() {
            println!("[Window Setup] Final outer size: {}x{}", size.width, size.height);
          }
          if let Ok(inner_size) = window_clone.inner_size() {
            println!("[Window Setup] Final inner size: {}x{}", inner_size.width, inner_size.height);
          }
          if let Ok(position) = window_clone.outer_position() {
            println!("[Window Setup] Final position: ({}, {})", position.x, position.y);
          }
          if let Ok(scale) = window_clone.scale_factor() {
            println!("[Window Setup] Scale factor: {}", scale);
          }
          if let Ok(is_maximized) = window_clone.is_maximized() {
            println!("[Window Setup] Is maximized: {}", is_maximized);
          }

          // Set focus
          if let Err(e) = window_clone.set_focus() {
            println!("[Window Setup] ERROR: Failed to set focus: {}", e);
          }

          println!("[Window Setup] VS Code-style window setup complete");
        });
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
