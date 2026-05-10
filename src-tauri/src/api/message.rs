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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TimelineItem {
    pub id: String,
    #[serde(rename = "messageId")]
    pub message_id: String,
    #[serde(rename = "type")]
    pub item_type: String,  // "thinking", "tool_call", "output"
    pub timestamp: i64,
    pub content: Option<String>,
    pub tool: Option<String>,
    pub action: Option<String>,
    pub status: Option<String>,
    pub result: Option<String>,
    #[serde(rename = "toolUseId", skip_serializing_if = "Option::is_none")]
    pub tool_use_id: Option<String>,
}

#[derive(Deserialize)]
pub struct MessageCreateRequest {
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub request_id: Option<String>,
    pub is_streaming: bool,
    pub tool_calls: Option<Vec<ToolCallRecord>>,
    pub timeline: Option<Vec<TimelineItem>>,
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
    pub timeline: Option<Vec<TimelineItem>>,
}
