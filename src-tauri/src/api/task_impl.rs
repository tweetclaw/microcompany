use rusqlite::params;
use crate::api::{TaskCreateRequest, Task, TaskRole};
use crate::database::get_pool;
use uuid::Uuid;
use chrono::Utc;

pub async fn create_task(
    task_request: TaskCreateRequest,
) -> Result<Task, String> {
    let task_id = format!("task-{}", Uuid::new_v4());
    let mut session_configs = Vec::new();

    // Step 1: Insert task and roles into database
    {
        let pool = get_pool()?;
        let mut conn = pool.get()
            .map_err(|e| format!("Failed to get database connection: {}", e))?;

        let tx = conn.transaction()
            .map_err(|e| format!("Failed to start transaction: {}", e))?;

        tx.execute(
            "INSERT INTO tasks (id, name, description, icon) VALUES (?1, ?2, ?3, ?4)",
            params![&task_id, &task_request.name, &task_request.description, &task_request.icon],
        ).map_err(|e| format!("Failed to insert task: {}", e))?;

        for role in &task_request.roles {
            let role_id = format!("role-{}", Uuid::new_v4());
            let session_id = format!("task-{}-role-{}-{}", task_id, role_id, Uuid::new_v4());

            tx.execute(
                "INSERT INTO roles (id, task_id, name, identity, model, provider)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![&role_id, &task_id, &role.name, &role.identity, &role.model, &role.provider],
            ).map_err(|e| format!("Failed to insert role: {}", e))?;

            tx.execute(
                "INSERT INTO sessions (id, type, name, model, provider, status, task_id, role_id)
                 VALUES (?1, 'task', ?2, ?3, ?4, 'initializing', ?5, ?6)",
                params![&session_id, &role.name, &role.model, &role.provider, &task_id, &role_id],
            ).map_err(|e| format!("Failed to insert session: {}", e))?;

            session_configs.push((session_id, role_id, role.clone()));
        }

        tx.commit()
            .map_err(|e| format!("Failed to commit transaction: {}", e))?;
    }

    // Step 2: Create Claurst sessions (async operations)
    let mut created_sessions = Vec::new();
    let mut task_roles = Vec::new();

    for (session_id, role_id, role) in session_configs {
        match create_claurst_session_with_retry(&session_id, &role, 3).await {
            Ok(_) => {
                // Update session status to ready
                let pool = get_pool()?;
                let conn = pool.get()
                    .map_err(|e| format!("Failed to get database connection: {}", e))?;

                conn.execute(
                    "UPDATE sessions SET status = 'ready' WHERE id = ?1",
                    params![&session_id],
                ).map_err(|e| {
                    cleanup_claurst_sessions(&created_sessions);
                    format!("Failed to update session status: {}", e)
                })?;

                created_sessions.push(session_id.clone());

                task_roles.push(TaskRole {
                    id: role_id,
                    name: role.name.clone(),
                    identity: role.identity.clone(),
                    model: role.model.clone(),
                    provider: role.provider.clone(),
                    session_id: session_id.clone(),
                    created_at: Utc::now().to_rfc3339(),
                });
            }
            Err(e) => {
                cleanup_claurst_sessions(&created_sessions);
                rollback_task(&task_id);
                return Err(format!("Failed to create Claurst session for role {}: {}", role.name, e));
            }
        }
    }

    Ok(Task {
        id: task_id,
        name: task_request.name,
        description: task_request.description,
        icon: task_request.icon,
        roles: task_roles,
        created_at: Utc::now().to_rfc3339(),
        updated_at: Utc::now().to_rfc3339(),
    })
}

fn rollback_task(task_id: &str) {
    if let Ok(pool) = get_pool() {
        if let Ok(conn) = pool.get() {
            let _ = conn.execute("DELETE FROM sessions WHERE task_id = ?1", params![task_id]);
            let _ = conn.execute("DELETE FROM roles WHERE task_id = ?1", params![task_id]);
            let _ = conn.execute("DELETE FROM tasks WHERE id = ?1", params![task_id]);
        }
    }
}

fn cleanup_claurst_sessions(session_ids: &[String]) {
    for session_id in session_ids {
        let sid = session_id.clone();
        tokio::spawn(async move {
            let _ = delete_claurst_session(&sid).await;
        });
    }
}

async fn create_claurst_session_with_retry(
    _session_id: &str,
    _role: &crate::api::RoleConfig,
    max_retries: u32,
) -> Result<(), String> {
    let mut retries = 0;
    let mut last_error = String::new();

    while retries <= max_retries {
        match create_claurst_session_api(_session_id, _role).await {
            Ok(_) => return Ok(()),
            Err(e) => {
                last_error = e.to_string();
                if retries < max_retries {
                    let delay = std::time::Duration::from_millis(100 * 2_u64.pow(retries));
                    tokio::time::sleep(delay).await;
                    retries += 1;
                } else {
                    break;
                }
            }
        }
    }

    Err(format!("Failed after {} retries: {}", max_retries, last_error))
}

async fn create_claurst_session_api(
    session_id: &str,
    role: &crate::api::RoleConfig,
) -> Result<(), String> {
    use crate::config::AppConfig;
    use crate::claurst::ClaurstSession;
    use std::path::PathBuf;

    let config = AppConfig::load()
        .map_err(|e| format!("Failed to load config: {}", e))?;

    let provider = config.providers.iter()
        .find(|p| p.id == role.provider)
        .ok_or_else(|| format!("Provider '{}' not found in config", role.provider))?;

    if provider.api_key.is_empty() {
        return Err(format!("API key not configured for provider '{}'", role.provider));
    }

    let working_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;

    let _session = ClaurstSession::new(
        session_id.to_string(),
        working_dir,
        provider.api_key.clone(),
        role.model.clone(),
        provider.base_url.clone(),
    ).map_err(|e| format!("Failed to create Claurst session: {}", e))?;

    Ok(())
}

async fn delete_claurst_session(session_id: &str) -> Result<(), String> {
    use crate::storage::ConversationStorage;

    let storage = ConversationStorage::new()
        .map_err(|e| format!("Failed to initialize storage: {}", e))?;

    storage.delete_session(session_id)
        .map_err(|e| format!("Failed to delete session storage: {}", e))?;

    Ok(())
}
