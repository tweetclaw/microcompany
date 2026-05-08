use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct ToolCallRecord {
    pub id: String,
    pub tool: String,
    pub action: String,
    pub status: String,
    pub result: Option<String>,
    pub timestamp: i64,
}

#[derive(Deserialize)]
pub struct MessageCreateRequest {
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub request_id: Option<String>,
    pub is_streaming: bool,
    pub tool_calls: Option<Vec<ToolCallRecord>>,
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
    pub tool_calls: Option<Vec<ToolCallRecord>>,
}
