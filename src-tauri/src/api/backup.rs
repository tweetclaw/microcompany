use serde::Serialize;

#[derive(Serialize)]
pub struct BackupInfo {
    pub backup_path: String,
    pub backup_size: u64,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct VacuumResult {
    pub size_before: u64,
    pub size_after: u64,
    pub space_reclaimed: u64,
}
