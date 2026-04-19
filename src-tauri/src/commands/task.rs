use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRole {
    pub id: String,
    pub name: String,
    pub identity: String,
    pub provider_id: String,
    pub provider_name: String,
    pub model: String,
    pub system_prompt: Option<String>,
    pub session_id: Option<String>,
    pub session_ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub roles: Vec<TaskRole>,
    pub created_at: i64,
}

fn get_task_storage_dir() -> anyhow::Result<PathBuf> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("Failed to get home directory"))?;
    let task_dir = home_dir.join(".microcompany").join("tasks");
    if !task_dir.exists() {
        fs::create_dir_all(&task_dir)?;
    }
    Ok(task_dir)
}

#[tauri::command]
pub async fn save_task(task: Task) -> Result<(), String> {
    let task_dir = get_task_storage_dir()
        .map_err(|e| format!("Failed to get task storage directory: {}", e))?;

    let task_file = task_dir.join(format!("{}.json", task.id));
    let json = serde_json::to_string_pretty(&task)
        .map_err(|e| format!("Failed to serialize task: {}", e))?;

    fs::write(task_file, json)
        .map_err(|e| format!("Failed to write task file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn load_task(task_id: String) -> Result<Task, String> {
    let task_dir = get_task_storage_dir()
        .map_err(|e| format!("Failed to get task storage directory: {}", e))?;

    let task_file = task_dir.join(format!("{}.json", task_id));
    if !task_file.exists() {
        return Err(format!("Task not found: {}", task_id));
    }

    let content = fs::read_to_string(task_file)
        .map_err(|e| format!("Failed to read task file: {}", e))?;

    let task: Task = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse task file: {}", e))?;

    Ok(task)
}

#[tauri::command]
pub async fn list_tasks() -> Result<Vec<Task>, String> {
    let task_dir = get_task_storage_dir()
        .map_err(|e| format!("Failed to get task storage directory: {}", e))?;

    let mut tasks = Vec::new();

    if let Ok(entries) = fs::read_dir(task_dir) {
        for entry in entries.flatten() {
            if let Ok(content) = fs::read_to_string(entry.path()) {
                if let Ok(task) = serde_json::from_str::<Task>(&content) {
                    tasks.push(task);
                }
            }
        }
    }

    tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(tasks)
}

#[tauri::command]
pub async fn delete_task(task_id: String) -> Result<(), String> {
    let task_dir = get_task_storage_dir()
        .map_err(|e| format!("Failed to get task storage directory: {}", e))?;

    let task_file = task_dir.join(format!("{}.json", task_id));
    if task_file.exists() {
        fs::remove_file(task_file)
            .map_err(|e| format!("Failed to delete task file: {}", e))?;
    }

    Ok(())
}
