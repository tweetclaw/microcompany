use serde::Serialize;
use crate::api::Message;

#[derive(Serialize)]
pub struct MessageSearchResult {
    pub message: Message,
    pub session_name: String,
    pub session_type: String,
    pub task_name: Option<String>,
    pub role_name: Option<String>,
    pub snippet: String,
    pub rank: f64,
}
