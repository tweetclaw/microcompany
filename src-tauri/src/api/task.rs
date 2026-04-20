use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct TaskCreateRequest {
    pub name: String,
    pub description: String,
    pub icon: String,
    pub roles: Vec<RoleConfig>,
}

#[derive(Deserialize, Clone)]
pub struct RoleConfig {
    pub name: String,
    pub identity: String,
    pub model: String,
    pub provider: String,
}

#[derive(Serialize)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub roles: Vec<TaskRole>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct TaskRole {
    pub id: String,
    pub name: String,
    pub identity: String,
    pub model: String,
    pub provider: String,
    pub session_id: String,
    pub created_at: String,
}
