use std::path::PathBuf;

mod loader;
mod prompt_builder;
mod sync;

pub use loader::RoleArchetype;
pub use prompt_builder::{
    build_role_system_prompt_v2,
    RolePromptContext,
    TeamRolePromptContext,
    TASK_PROMPT_CONTRACT_VERSION,
};
pub use sync::sync_archetype_resources;
pub use sync::sync_role_definition_files;

pub fn archetypes_root_dir() -> anyhow::Result<PathBuf> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("Failed to get home directory"))?;
    Ok(home_dir.join(".microcompany").join("archetypes"))
}

pub fn list_role_archetypes() -> Result<Vec<RoleArchetype>, String> {
    loader::load_system_archetypes().map_err(|e| format!("Failed to load archetypes: {}", e))
}

pub fn get_role_archetype(archetype_id: &str) -> Result<Option<RoleArchetype>, String> {
    loader::load_system_archetype_by_id(archetype_id)
        .map_err(|e| format!("Failed to load archetype {}: {}", archetype_id, e))
}

fn role_definition_file_name(archetype_id: &str) -> String {
    match archetype_id {
        "software_engineer" => "backend_developer.md".to_string(),
        "quality_assurance" => "qa_engineer.md".to_string(),
        _ if archetype_id.ends_with(".md") => archetype_id.to_string(),
        _ => format!("{}.md", archetype_id),
    }
}

pub fn get_role_definition_path(archetype_id: &str) -> String {
    let root = archetypes_root_dir().unwrap_or_else(|_| PathBuf::from("src-tauri/resources/archetypes"));
    let role_defs_dir = root.join("role-definitions");
    let file_name = role_definition_file_name(archetype_id);
    
    role_defs_dir
        .join(&file_name)
        .to_string_lossy()
        .to_string()
}
