use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct MessageCreateRequest {
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub request_id: Option<String>,
    pub is_streaming: bool,
}

#[derive(Serialize)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub request_id: Option<String>,
    pub is_streaming: bool,
}
