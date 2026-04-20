use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct Session {
    pub id: String,
    pub r#type: String,
    pub name: String,
    pub model: String,
    pub provider: String,
    pub working_directory: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub task_id: Option<String>,
    pub role_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct SessionSummary {
    pub id: String,
    pub r#type: String,
    pub name: String,
    pub model: String,
    pub provider: String,
    pub status: String,
    pub message_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct DeleteSessionResult {
    pub deleted_session_id: String,
    pub deleted_message_count: i32,
}
