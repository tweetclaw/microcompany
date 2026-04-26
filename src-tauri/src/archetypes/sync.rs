use crate::archetypes::loader::ArchetypeManifest;
use crate::archetypes::archetypes_root_dir;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn sync_archetype_resources(app: &AppHandle) -> Result<(), String> {
    let bundled_root = resolve_bundled_root(app)?;

    let local_root = archetypes_root_dir()
        .map_err(|e| format!("Failed to resolve archetype root: {}", e))?;

    sync_from_bundled_dir(&bundled_root, &local_root)
}

fn resolve_bundled_root(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("archetypes"));
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("../Resources/archetypes"));
            candidates.push(exe_dir.join("resources/archetypes"));
        }
    }

    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("archetypes"),
    );

    candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| {
            "Bundled archetype resources not found in any known location".to_string()
        })
}

fn sync_from_bundled_dir(bundled_root: &Path, local_root: &Path) -> Result<(), String> {
    if !bundled_root.exists() {
        return Err(format!(
            "Bundled archetype resources not found at {}",
            bundled_root.display()
        ));
    }

    fs::create_dir_all(local_root.join("system"))
        .map_err(|e| format!("Failed to create local system archetype directory: {}", e))?;
    fs::create_dir_all(local_root.join("custom"))
        .map_err(|e| format!("Failed to create local custom archetype directory: {}", e))?;

    let bundled_manifest_path = bundled_root.join("manifest.json");
    let local_manifest_path = local_root.join("manifest.json");

    let bundled_manifest = read_manifest(&bundled_manifest_path)?;
    let should_sync_system = match read_manifest_if_exists(&local_manifest_path)? {
        Some(local_manifest) => local_manifest.version != bundled_manifest.version
            || local_manifest.system_files != bundled_manifest.system_files,
        None => true,
    };

    if should_sync_system {
        sync_system_dir(&bundled_root.join("system"), &local_root.join("system"), &bundled_manifest)?;
        fs::copy(&bundled_manifest_path, &local_manifest_path)
            .map_err(|e| format!("Failed to copy archetype manifest: {}", e))?;
    }

    Ok(())
}

fn sync_system_dir(
    bundled_system_dir: &Path,
    local_system_dir: &Path,
    manifest: &ArchetypeManifest,
) -> Result<(), String> {
    if local_system_dir.exists() {
        for entry in fs::read_dir(local_system_dir)
            .map_err(|e| format!("Failed to read local system archetype directory: {}", e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read system archetype entry: {}", e))?;
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            if path.is_file() && !manifest.system_files.iter().any(|name| name == &file_name) {
                fs::remove_file(&path).map_err(|e| {
                    format!(
                        "Failed to remove outdated system archetype {}: {}",
                        path.display(),
                        e
                    )
                })?;
            }
        }
    }

    for file_name in &manifest.system_files {
        let source = bundled_system_dir.join(file_name);
        let target = local_system_dir.join(file_name);
        fs::copy(&source, &target).map_err(|e| {
            format!(
                "Failed to copy system archetype {} to {}: {}",
                source.display(),
                target.display(),
                e
            )
        })?;
    }

    Ok(())
}

fn read_manifest(path: &Path) -> Result<ArchetypeManifest, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read archetype manifest {}: {}", path.display(), e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse archetype manifest {}: {}", path.display(), e))
}

fn read_manifest_if_exists(path: &Path) -> Result<Option<ArchetypeManifest>, String> {
    if !path.exists() {
        return Ok(None);
    }

    read_manifest(path).map(Some)
}

#[cfg(test)]
mod tests {
    use super::sync_from_bundled_dir;
    use std::fs;

    fn unique_temp_dir(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "microcompany-archetype-test-{}-{}",
            label,
            uuid::Uuid::new_v4()
        ))
    }

    #[test]
    fn sync_copies_manifest_and_system_files_without_touching_custom() {
        let bundled_root = unique_temp_dir("bundled");
        let local_root = unique_temp_dir("local");

        fs::create_dir_all(bundled_root.join("system")).unwrap();
        fs::write(
            bundled_root.join("manifest.json"),
            r#"{"version":"1.0.0","systemFiles":["demo.json"]}"#,
        )
        .unwrap();
        fs::write(bundled_root.join("system").join("demo.json"), "{}").unwrap();

        fs::create_dir_all(local_root.join("custom")).unwrap();
        fs::write(local_root.join("custom").join("mine.json"), "custom").unwrap();

        sync_from_bundled_dir(&bundled_root, &local_root).unwrap();

        assert!(local_root.join("manifest.json").exists());
        assert!(local_root.join("system").join("demo.json").exists());
        assert_eq!(
            fs::read_to_string(local_root.join("custom").join("mine.json")).unwrap(),
            "custom"
        );

        let _ = fs::remove_dir_all(bundled_root);
        let _ = fs::remove_dir_all(local_root);
    }
}
