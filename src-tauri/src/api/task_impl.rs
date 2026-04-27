use crate::api::{Task, TaskCreateRequest, TaskRole};
use crate::database::get_pool;
use chrono::Utc;
use rusqlite::params;
use sha2::{Digest, Sha256};
use uuid::Uuid;

const CUSTOM_ARCHETYPE_ID: &str = "custom";
const PRODUCT_MANAGER_ARCHETYPE_IDS: &[&str] = &["product_manager"];
const PRODUCT_MANAGER_IDENTITIES: &[&str] = &["product manager", "pm", "项目经理", "产品经理"];

#[derive(Clone)]
struct SessionConfigRecord {
    session_id: String,
    role_id: String,
    role: crate::api::RoleConfig,
    prompt_snapshot: PromptSnapshot,
    working_directory: String,
}

#[derive(Clone)]
struct PromptSnapshot {
    text: String,
    source_type: String,
    hash: String,
    contract_version: String,
}

pub async fn create_task(task_request: TaskCreateRequest) -> Result<Task, String> {
    validate_task_request(&task_request)?;

    let task_id = format!("task-{}", Uuid::new_v4());
    let mut session_configs = Vec::new();

    log::info!(
        "task_create_begin task_id={} name={} role_count={} pm_first_workflow={}",
        task_id,
        task_request.name,
        task_request.roles.len(),
        task_request.pm_first_workflow
    );

    {
        let pool = get_pool()?;
        let mut conn = pool
            .get()
            .map_err(|e| format!("Failed to get database connection: {}", e))?;

        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to start transaction: {}", e))?;

        tx.execute(
            "INSERT INTO tasks (id, name, description, icon, pm_first_workflow) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                &task_id,
                &task_request.name,
                &task_request.description,
                &task_request.icon,
                task_request.pm_first_workflow,
            ],
        )
        .map_err(|e| format!("Failed to insert task: {}", e))?;

        for role in &task_request.roles {
            let role_id = format!("role-{}", Uuid::new_v4());
            let session_id = format!("session-{}", Uuid::new_v4());
            let prompt_snapshot = build_system_prompt_snapshot(
                role,
                &task_request.name,
                &task_request.description,
                task_request.pm_first_workflow,
            )?;

            log::info!(
                "task_role_prompt_built task_id={} role_id={} role_name={} archetype_id={} provider={} model={} handoff_enabled={} prompt_source_type={} prompt_hash={} prompt_contract_version={}",
                task_id,
                role_id,
                role.name,
                role.archetype_id.as_deref().unwrap_or("none"),
                role.provider,
                role.model,
                role.handoff_enabled,
                prompt_snapshot.source_type,
                prompt_snapshot.hash,
                prompt_snapshot.contract_version
            );

            tx.execute(
                "INSERT INTO roles (id, task_id, name, identity, archetype_id, system_prompt_append, custom_system_prompt, system_prompt_snapshot, prompt_source_type, prompt_hash, prompt_contract_version, model, provider, handoff_enabled, display_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                params![
                    &role_id,
                    &task_id,
                    &role.name,
                    &role.identity,
                    &role.archetype_id,
                    &role.system_prompt_append,
                    &role.custom_system_prompt,
                    &prompt_snapshot.text,
                    &prompt_snapshot.source_type,
                    &prompt_snapshot.hash,
                    &prompt_snapshot.contract_version,
                    &role.model,
                    &role.provider,
                    &role.handoff_enabled,
                    &role.display_order,
                ],
            )
            .map_err(|e| format!("Failed to insert role: {}", e))?;

            tx.execute(
        "INSERT INTO sessions (id, type, name, model, provider, working_directory, status, task_id, role_id)
                 VALUES (?1, 'task', ?2, ?3, ?4, ?5, 'initializing', ?6, ?7)",
                params![
                    &session_id,
                    &role.name,
                    &role.model,
                    &role.provider,
                    &task_request.working_directory,
                    &task_id,
                    &role_id
                ],
            )
            .map_err(|e| format!("Failed to insert session: {}", e))?;

            log::info!(
                "task_session_row_created task_id={} role_id={} role_name={} session_id={} provider={} model={} working_dir={}",
                task_id,
                role_id,
                role.name,
                session_id,
                role.provider,
                role.model,
                task_request.working_directory
            );

            session_configs.push(SessionConfigRecord {
                session_id,
                role_id,
                role: role.clone(),
                prompt_snapshot,
                working_directory: task_request.working_directory.clone(),
            });
        }

        tx.commit()
            .map_err(|e| format!("Failed to commit transaction: {}", e))?;
    }

    let mut created_sessions = Vec::new();
    let mut task_roles = Vec::new();

    for session_config in session_configs {
        let SessionConfigRecord {
            session_id,
            role_id,
            role,
            prompt_snapshot,
            working_directory,
        } = session_config;

        match create_claurst_session_with_retry(&session_id, &role, &prompt_snapshot, &working_directory, 3).await {
            Ok(_) => {
                let pool = get_pool()?;
                let conn = pool
                    .get()
                    .map_err(|e| format!("Failed to get database connection: {}", e))?;

                conn.execute(
                    "UPDATE sessions SET status = 'ready' WHERE id = ?1",
                    params![&session_id],
                )
                .map_err(|e| {
                    cleanup_claurst_sessions(&created_sessions);
                    format!("Failed to update session status: {}", e)
                })?;

                log::info!(
                    "task_session_ready task_id={} role_id={} role_name={} session_id={} prompt_source_type={} prompt_hash={}",
                    task_id,
                    role_id,
                    role.name,
                    session_id,
                    prompt_snapshot.source_type,
                    prompt_snapshot.hash
                );

                created_sessions.push(session_id.clone());

                task_roles.push(TaskRole {
                    id: role_id,
                    name: role.name.clone(),
                    identity: role.identity.clone(),
                    archetype_id: role.archetype_id.clone(),
                    system_prompt_snapshot: Some(prompt_snapshot.text.clone()),
                    prompt_source_type: Some(prompt_snapshot.source_type.clone()),
                    prompt_hash: Some(prompt_snapshot.hash.clone()),
                    prompt_contract_version: Some(prompt_snapshot.contract_version.clone()),
                    model: role.model.clone(),
                    provider: role.provider.clone(),
                    handoff_enabled: role.handoff_enabled,
                    display_order: role.display_order,
                    session_id: session_id.clone(),
                    created_at: Utc::now().to_rfc3339(),
                });
            }
            Err(e) => {
                log::error!(
                    "task_session_create_failed task_id={} role_id={} role_name={} session_id={} error={}",
                    task_id,
                    role_id,
                    role.name,
                    session_id,
                    e
                );
                cleanup_claurst_sessions(&created_sessions);
                rollback_task(&task_id);
                return Err(format!(
                    "Failed to create Claurst session for role {}: {}",
                    role.name, e
                ));
            }
        }
    }

    log::info!(
        "task_create_complete task_id={} role_count={} pm_first_workflow={}",
        task_id,
        task_roles.len(),
        task_request.pm_first_workflow
    );

    Ok(Task {
        id: task_id,
        name: task_request.name,
        description: task_request.description,
        icon: task_request.icon,
        pm_first_workflow: task_request.pm_first_workflow,
        roles: task_roles,
        created_at: Utc::now().to_rfc3339(),
        updated_at: Utc::now().to_rfc3339(),
    })
}

fn validate_task_request(task_request: &TaskCreateRequest) -> Result<(), String> {
    if task_request.pm_first_workflow && !has_product_manager_role(&task_request.roles) {
        return Err(
            "PM-first workflow requires at least one Product Manager role".to_string(),
        );
    }

    Ok(())
}

fn has_product_manager_role(roles: &[crate::api::RoleConfig]) -> bool {
    roles.iter().any(|role| {
        role.archetype_id
            .as_deref()
            .map(|value| PRODUCT_MANAGER_ARCHETYPE_IDS.contains(&value))
            .unwrap_or(false)
            || PRODUCT_MANAGER_IDENTITIES.contains(&role.identity.trim().to_lowercase().as_str())
    })
}

fn build_system_prompt_snapshot(
    role: &crate::api::RoleConfig,
    task_name: &str,
    task_description: &str,
    pm_first_workflow: bool,
) -> Result<PromptSnapshot, String> {
    let prompt_text = if role.archetype_id.as_deref() == Some(CUSTOM_ARCHETYPE_ID) {
        let custom_prompt = role
            .custom_system_prompt
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "Custom archetype requires a full system prompt".to_string())?;

        crate::archetypes::build_custom_role_system_prompt(
            &role.name,
            &role.identity,
            task_name,
            task_description,
            custom_prompt,
            role.handoff_enabled,
            pm_first_workflow,
        )
    } else {
        let archetype = match &role.archetype_id {
            Some(archetype_id) => crate::archetypes::get_role_archetype(archetype_id)?,
            None => None,
        };

        let mut prompt = crate::archetypes::build_role_system_prompt(
            archetype.as_ref(),
            &role.name,
            &role.identity,
            task_name,
            task_description,
            role.system_prompt_append.as_deref(),
            role.handoff_enabled,
        );

        if pm_first_workflow {
            prompt.push_str("\n\n");
            prompt.push_str(&crate::archetypes::pm_first_workflow_prompt(&role.identity));
        }

        prompt
    };

    Ok(PromptSnapshot {
        hash: hash_prompt(&prompt_text),
        source_type: if role.archetype_id.as_deref() == Some(CUSTOM_ARCHETYPE_ID) {
            "custom".to_string()
        } else {
            "built_in".to_string()
        },
        contract_version: crate::archetypes::TASK_PROMPT_CONTRACT_VERSION.to_string(),
        text: prompt_text,
    })
}

fn hash_prompt(prompt: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(prompt.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn rollback_task(task_id: &str) {
    log::warn!("task_create_rollback task_id={}", task_id);
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
        log::warn!("task_session_cleanup session_id={}", sid);
        tokio::spawn(async move {
            let _ = delete_claurst_session(&sid).await;
        });
    }
}

async fn create_claurst_session_with_retry(
    session_id: &str,
    role: &crate::api::RoleConfig,
    prompt_snapshot: &PromptSnapshot,
    working_directory: &str,
    max_retries: u32,
) -> Result<(), String> {
    let mut retries = 0;
    let mut last_error = String::new();

    while retries <= max_retries {
        log::info!(
            "task_session_create_attempt session_id={} role_name={} provider={} model={} working_dir={} attempt={} prompt_hash={}",
            session_id,
            role.name,
            role.provider,
            role.model,
            working_directory,
            retries + 1,
            prompt_snapshot.hash
        );

        match create_claurst_session_api(session_id, role, prompt_snapshot, working_directory).await {
            Ok(_) => return Ok(()),
            Err(e) => {
                last_error = e.to_string();
                log::warn!(
                    "task_session_create_retry session_id={} role_name={} attempt={} error={}",
                    session_id,
                    role.name,
                    retries + 1,
                    last_error
                );
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
    prompt_snapshot: &PromptSnapshot,
    working_directory: &str,
) -> Result<(), String> {
    use crate::claurst::ClaurstSession;
    use crate::config::AppConfig;

    let config = AppConfig::load().map_err(|e| format!("Failed to load config: {}", e))?;

    let provider = config
        .providers
        .iter()
        .find(|p| p.id == role.provider)
        .ok_or_else(|| format!("Provider '{}' not found in config", role.provider))?;

    if provider.id != "ollama" && provider.api_key.is_empty() {
        return Err(format!("API key not configured for provider '{}'", role.provider));
    }

    let _session = ClaurstSession::new(
        session_id.to_string(),
        std::path::PathBuf::from(working_directory),
        provider.api_key.clone(),
        role.model.clone(),
        provider.base_url.clone(),
        Some(prompt_snapshot.text.clone()),
    )
    .map_err(|e| format!("Failed to create Claurst session: {}", e))?;

    Ok(())
}

pub(super) async fn delete_claurst_session(session_id: &str) -> Result<(), String> {
    use crate::storage::ConversationStorage;

    let storage = ConversationStorage::new()
        .map_err(|e| format!("Failed to initialize storage: {}", e))?;

    storage
        .delete_session(session_id)
        .map_err(|e| format!("Failed to delete session storage: {}", e))?;

    Ok(())
}
