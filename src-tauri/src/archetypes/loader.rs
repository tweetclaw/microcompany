use crate::archetypes::archetypes_root_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchetypeManifest {
    pub version: String,
    pub system_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptFragments {
    pub role_system: String,
    pub team_guidance: String,
    pub task_guidance: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceMetadata {
    pub repository: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleArchetype {
    pub id: String,
    pub label: String,
    pub summary: String,
    pub description: String,
    pub responsibilities: Vec<String>,
    pub boundaries: Vec<String>,
    pub deliverables: Vec<String>,
    pub handoff_guidance: String,
    pub recommended_next_archetypes: Vec<String>,
    pub prompt_fragments: PromptFragments,
    pub source: SourceMetadata,
}

fn manifest_path() -> anyhow::Result<PathBuf> {
    Ok(archetypes_root_dir()?.join("manifest.json"))
}

pub fn load_manifest() -> anyhow::Result<ArchetypeManifest> {
    let content = fs::read_to_string(manifest_path()?)?;
    Ok(serde_json::from_str(&content)?)
}

pub fn load_system_archetypes() -> anyhow::Result<Vec<RoleArchetype>> {
    let root = archetypes_root_dir()?;
    let manifest = load_manifest()?;
    let system_dir = root.join("system");
    let mut archetypes = Vec::with_capacity(manifest.system_files.len());

    for file_name in manifest.system_files {
        let content = fs::read_to_string(system_dir.join(file_name))?;
        let archetype: RoleArchetype = serde_json::from_str(&content)?;
        archetypes.push(archetype);
    }

    archetypes.sort_by(|left, right| left.label.cmp(&right.label));
    Ok(archetypes)
}

pub fn load_system_archetype_by_id(archetype_id: &str) -> anyhow::Result<Option<RoleArchetype>> {
    Ok(load_system_archetypes()?
        .into_iter()
        .find(|archetype| archetype.id == archetype_id))
}
