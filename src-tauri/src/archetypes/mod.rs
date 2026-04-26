use std::path::PathBuf;

mod loader;
mod prompt_builder;
mod sync;

pub use loader::RoleArchetype;
pub use prompt_builder::build_role_system_prompt;
pub use sync::sync_archetype_resources;

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
