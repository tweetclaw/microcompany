use std::fs;
use std::path::{Path, PathBuf};
use chrono::Utc;
use crate::api::backup::{BackupInfo, VacuumResult};
use crate::database::get_pool;

fn get_microcompany_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".microcompany"))
        .ok_or_else(|| "Failed to get home directory".to_string())
}

fn get_backup_dir() -> Result<PathBuf, String> {
    Ok(get_microcompany_dir()?.join("backups"))
}

fn get_db_path() -> Result<PathBuf, String> {
    Ok(get_microcompany_dir()?.join("data.db"))
}

pub async fn create_backup() -> Result<BackupInfo, String> {
    let backup_dir = get_backup_dir()?;
    fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let timestamp = Utc::now().format("%Y-%m-%d-%H%M%S").to_string();
    let backup_filename = format!("data-{}.db", timestamp);
    let backup_path = backup_dir.join(&backup_filename);

    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let backup_path_str = backup_path.to_string_lossy().to_string();
    conn.execute("VACUUM INTO ?1", [&backup_path_str])
        .map_err(|e| format!("Failed to create backup: {}", e))?;

    let metadata = fs::metadata(&backup_path)
        .map_err(|e| format!("Failed to get backup metadata: {}", e))?;

    let backup_size = metadata.len();
    let created_at = chrono::DateTime::<Utc>::from(
        metadata.created()
            .map_err(|e| format!("Failed to get backup creation time: {}", e))?
    ).to_rfc3339();

    Ok(BackupInfo {
        backup_path: backup_path.to_string_lossy().to_string(),
        backup_size,
        created_at,
    })
}

pub async fn list_backups() -> Result<Vec<BackupInfo>, String> {
    let backup_dir = get_backup_dir()?;

    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&backup_dir)
        .map_err(|e| format!("Failed to read backup directory: {}", e))?;

    let mut backups = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("db") {
            let metadata = fs::metadata(&path)
                .map_err(|e| format!("Failed to get file metadata: {}", e))?;

            let created_at = metadata.created()
                .map_err(|e| format!("Failed to get creation time: {}", e))?;

            let created_at_str = chrono::DateTime::<Utc>::from(created_at).to_rfc3339();

            backups.push(BackupInfo {
                backup_path: path.to_string_lossy().to_string(),
                backup_size: metadata.len(),
                created_at: created_at_str,
            });
        }
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(backups)
}

pub async fn restore_backup(
    backup_path: String,
) -> Result<(), String> {
    let backup_path = Path::new(&backup_path);

    if !backup_path.exists() {
        return Err(format!("Backup file not found: {}", backup_path.display()));
    }

    {
        let temp_conn = rusqlite::Connection::open(backup_path)
            .map_err(|e| format!("Invalid backup file: {}", e))?;

        temp_conn.pragma_query(None, "integrity_check", |row| {
            let result: String = row.get(0)?;
            if result != "ok" {
                return Err(rusqlite::Error::InvalidQuery);
            }
            Ok(())
        }).map_err(|e| format!("Backup file integrity check failed: {}", e))?;
    }

    create_backup().await?;

    crate::database::pool::close_pool()
        .map_err(|e| format!("Failed to close connection pool: {}", e))?;

    let db_path = get_db_path()?;

    fs::copy(backup_path, &db_path)
        .map_err(|e| format!("Failed to restore backup: {}", e))?;

    crate::database::pool::init_pool(&db_path.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to reinitialize connection pool: {}", e))?;

    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    conn.pragma_query(None, "integrity_check", |row| {
        let result: String = row.get(0)?;
        if result != "ok" {
            return Err(rusqlite::Error::InvalidQuery);
        }
        Ok(())
    }).map_err(|e| format!("Restored database integrity check failed: {}", e))?;

    Ok(())
}

pub async fn vacuum_database() -> Result<VacuumResult, String> {
    let db_path = get_db_path()?;

    let size_before = fs::metadata(&db_path)
        .map_err(|e| format!("Failed to get database size: {}", e))?
        .len();

    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    conn.execute("VACUUM", [])
        .map_err(|e| format!("Failed to vacuum database: {}", e))?;

    drop(conn);
    drop(pool);

    std::thread::sleep(std::time::Duration::from_millis(100));

    let size_after = fs::metadata(&db_path)
        .map_err(|e| format!("Failed to get database size: {}", e))?
        .len();

    let space_reclaimed = size_before.saturating_sub(size_after);

    Ok(VacuumResult {
        size_before,
        size_after,
        space_reclaimed,
    })
}
