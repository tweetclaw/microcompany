use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct TemplateRole {
    pub name: String,
    pub identity: String,
    pub archetype_id: Option<String>,
    pub system_prompt_append: Option<String>,
    pub custom_system_prompt: Option<String>,
    pub model: String,
    pub provider: String,
    pub handoff_enabled: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SystemTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub category: String,
    pub pm_first_workflow: bool,
    pub roles: Vec<TemplateRole>,
    pub tags: Vec<String>,
    pub source_path: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct UserTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub pm_first_workflow: bool,
    pub roles: Vec<TemplateRole>,
    pub source_task_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TemplateSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub category: Option<String>,
    pub source: String,
    pub role_count: i32,
    pub tags: Vec<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SaveTemplateRequest {
    pub name: String,
    pub description: String,
    pub icon: String,
    pub source_task_id: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CreateFromTemplateRequest {
    pub template_id: String,
    pub template_source: String,
    pub task_name: String,
    pub role_overrides: Option<std::collections::HashMap<String, TemplateRoleOverride>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TemplateRoleOverride {
    pub provider: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TemplateDraft {
    pub task_name: String,
    pub description: String,
    pub icon: String,
    pub pm_first_workflow: bool,
    pub roles: Vec<TemplateRole>,
    pub warnings: Vec<TemplateWarning>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TemplateWarning {
    pub r#type: String,
    pub role_index: i32,
    pub role_name: String,
    pub message: String,
    pub blocking: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct UpdateTemplateRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub roles: Option<Vec<TemplateRole>>,
}
