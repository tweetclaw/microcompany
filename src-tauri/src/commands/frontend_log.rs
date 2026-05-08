use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct FrontendLogPayload {
    pub level: String,
    pub message: String,
    pub context: Option<serde_json::Value>,
}

#[tauri::command]
pub async fn log_from_frontend(payload: FrontendLogPayload) -> Result<(), String> {
    let context_str = if let Some(ctx) = &payload.context {
        format!(" {}", serde_json::to_string(ctx).unwrap_or_default())
    } else {
        String::new()
    };

    match payload.level.as_str() {
        "info" => println!("[FRONTEND_INFO] {}{}", payload.message, context_str),
        "warn" => println!("[FRONTEND_WARN] {}{}", payload.message, context_str),
        "error" => println!("[FRONTEND_ERROR] {}{}", payload.message, context_str),
        "debug" => println!("[FRONTEND_DEBUG] {}{}", payload.message, context_str),
        _ => println!("[FRONTEND] {}{}", payload.message, context_str),
    }

    Ok(())
}
