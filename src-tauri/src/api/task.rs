use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct TaskCreateRequest {
    pub name: String,
    pub description: String,
    pub icon: String,
    pub pm_first_workflow: bool,
    pub working_directory: String,
    pub roles: Vec<RoleConfig>,
}

#[derive(Deserialize)]
pub struct TaskUpdateRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
}

#[derive(Deserialize, Clone)]
pub struct RoleConfig {
    pub name: String,
    pub identity: String,
    pub archetype_id: Option<String>,
    pub system_prompt_append: Option<String>,
    pub custom_system_prompt: Option<String>,
    pub model: String,
    pub provider: String,
    pub handoff_enabled: bool,
    pub display_order: i32,
}

#[derive(Serialize)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub pm_first_workflow: bool,
    pub roles: Vec<TaskRole>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct TaskRole {
    pub id: String,
    pub name: String,
    pub identity: String,
    pub archetype_id: Option<String>,
    pub system_prompt_snapshot: Option<String>,
    pub prompt_source_type: Option<String>,
    pub prompt_hash: Option<String>,
    pub prompt_contract_version: Option<String>,
    pub model: String,
    pub provider: String,
    pub handoff_enabled: bool,
    pub display_order: i32,
    pub session_id: String,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamBrief {
    pub task_id: String,
    pub task_name: String,
    pub roles: Vec<TeamBriefRole>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamBriefRole {
    pub role_id: String,
    pub role_name: String,
    pub identity: String,
    pub archetype_id: Option<String>,
    pub archetype_label: Option<String>,
    pub responsibility_summary: Option<String>,
    pub handoff_guidance: Option<String>,
    pub recommended_next_role_ids: Vec<String>,
}

#[derive(Serialize)]
pub struct TaskSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub pm_first_workflow: bool,
    pub role_count: i32,
    pub total_messages: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct DeleteTaskResult {
    pub deleted_task_id: String,
    pub deleted_role_count: i32,
    pub deleted_session_count: i32,
    pub deleted_message_count: i32,
}
