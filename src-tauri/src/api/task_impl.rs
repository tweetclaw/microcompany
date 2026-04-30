use crate::api::{Task, TaskCreateRequest, TaskRole};
use crate::archetypes::{RolePromptContext, TeamRolePromptContext};
use crate::database::get_pool;
use crate::storage::ConversationStorage;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
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

fn build_role_prompt_contexts(roles: &[crate::api::RoleConfig]) -> Vec<RolePromptContext> {
    let roster = roles
        .iter()
        .map(|role| TeamRolePromptContext {
            name: role.name.clone(),
            identity: role.identity.clone(),
            archetype_id: role.archetype_id.clone(),
        })
        .collect::<Vec<_>>();

    roles
        .iter()
        .enumerate()
        .map(|(index, role)| {
            let recommended_handoff_roles = role
                .archetype_id
                .as_deref()
                .and_then(|archetype_id| crate::archetypes::get_role_archetype(archetype_id).ok().flatten())
                .map(|archetype| {
                    roster
                        .iter()
                        .enumerate()
                        .filter(|(candidate_index, _)| *candidate_index != index)
                        .filter(|(_, candidate)| {
                            candidate
                                .archetype_id
                                .as_deref()
                                .map(|candidate_id| archetype.recommended_next_archetypes.iter().any(|value| value == candidate_id))
                                .unwrap_or(false)
                        })
                        .map(|(_, candidate)| candidate.clone())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            RolePromptContext {
                roster: roster.clone(),
                active_role_index: index,
                recommended_handoff_roles,
            }
        })
        .collect()
}

fn role_roster_summary(role_context: &RolePromptContext) -> String {
    role_context
        .roster
        .iter()
        .map(|role| match role.archetype_id.as_deref().filter(|value| !value.is_empty()) {
            Some(archetype_id) => format!("{}:{}:{}", role.name, role.identity, archetype_id),
            None => format!("{}:{}", role.name, role.identity),
        })
        .collect::<Vec<_>>()
        .join("|")
}

fn handoff_role_summary(role_context: &RolePromptContext) -> String {
    if role_context.recommended_handoff_roles.is_empty() {
        return "none".to_string();
    }

    role_context
        .recommended_handoff_roles
        .iter()
        .map(|role| role.name.as_str())
        .collect::<Vec<_>>()
        .join("|")
}

fn create_task_session_storage(
    session_id: &str,
    working_directory: &str,
    provider_id: &str,
    provider_name: &str,
    model: &str,
) -> Result<(), String> {
    let storage = ConversationStorage::new()
        .map_err(|e| format!("Failed to initialize storage: {}", e))?;

    let file_name = format!("{}.json", session_id.trim_start_matches("session-"));
    let file_path = dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())?
        .join(".microcompany")
        .join("conversations")
        .join(file_name);

    if file_path.exists() {
        return Ok(());
    }

    let created_session_id = storage
        .create_session(
            &std::path::PathBuf::from(working_directory),
            Some(provider_id.to_string()),
            Some(provider_name.to_string()),
            Some(model.to_string()),
            None,
        )
        .map_err(|e| format!("Failed to create task session storage: {}", e))?;

    let created_file_path = dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())?
        .join(".microcompany")
        .join("conversations")
        .join(format!("{}.json", created_session_id));

    std::fs::rename(&created_file_path, &file_path)
        .map_err(|e| format!("Failed to finalize task session storage: {}", e))?;

    Ok(())
}

pub async fn create_task(task_request: TaskCreateRequest) -> Result<Task, String> {
    validate_task_request(&task_request)?;

    let task_id = format!("task-{}", Uuid::new_v4());
    let mut session_configs = Vec::new();
    let role_prompt_contexts = build_role_prompt_contexts(&task_request.roles);

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

        for (index, role) in task_request.roles.iter().enumerate() {
            let role_id = format!("role-{}", Uuid::new_v4());
            let session_id = format!("session-{}", Uuid::new_v4());
            let role_prompt_context = role_prompt_contexts
                .get(index)
                .ok_or_else(|| format!("Missing role prompt context for role {}", role.name))?;
            let prompt_snapshot = build_system_prompt_snapshot(
                role,
                &task_request.name,
                &task_request.description,
                task_request.pm_first_workflow,
                Some(role_prompt_context),
            )?;

            log::info!(
                "task_role_prompt_built task_id={} role_id={} role_name={} archetype_id={} provider={} model={} handoff_enabled={} prompt_source_type={} prompt_hash={} prompt_contract_version={} role_index={} role_roster={} handoff_candidates={}",
                task_id,
                role_id,
                role.name,
                role.archetype_id.as_deref().unwrap_or("none"),
                role.provider,
                role.model,
                role.handoff_enabled,
                prompt_snapshot.source_type,
                prompt_snapshot.hash,
                prompt_snapshot.contract_version,
                role_prompt_context.active_role_index,
                role_roster_summary(role_prompt_context),
                handoff_role_summary(role_prompt_context)
            );

            tx.execute(
                "INSERT INTO roles (id, task_id, name, identity, archetype_id, system_prompt_append, custom_system_prompt, system_prompt_snapshot, prompt_source_type, prompt_hash, prompt_contract_version, model, provider, handoff_enabled, display_order, active_session_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
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
                    &session_id,
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
                create_task_session_storage(
                    &session_id,
                    &working_directory,
                    &role.provider,
                    &role.name,
                    &role.model,
                )?;

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

fn resolve_restart_working_directory(stored_working_directory: &str) -> Result<String, String> {
    let trimmed = stored_working_directory.trim();
    if !trimmed.is_empty() {
        return Ok(trimmed.to_string());
    }

    let cwd = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;

    let fallback = cwd
        .parent()
        .filter(|_| cwd.file_name().and_then(|name| name.to_str()) == Some("src-tauri"))
        .map(std::path::Path::to_path_buf)
        .unwrap_or_else(|| cwd.clone());

    Ok(fallback.display().to_string())
}

pub async fn restart_task_role_session(task_id: String, role_id: String) -> Result<Task, String> {
    let (session_id, role_name, provider, model, working_directory, prompt_snapshot, prompt_source_type, prompt_hash, prompt_contract_version) = {
        let pool = get_pool()?;
        let mut conn = pool
            .get()
            .map_err(|e| format!("Failed to get database connection: {}", e))?;

        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to start transaction: {}", e))?;

        let role_row = tx.query_row(
            "SELECT r.name, r.provider, r.model, r.system_prompt_snapshot, r.prompt_source_type, r.prompt_hash, r.prompt_contract_version,
                    COALESCE(
                        (
                            SELECT s.working_directory
                            FROM sessions s
                            WHERE s.role_id = r.id
                              AND s.task_id = r.task_id
                              AND s.working_directory IS NOT NULL
                              AND TRIM(s.working_directory) != ''
                            ORDER BY s.created_at DESC, s.id DESC
                            LIMIT 1
                        ),
                        ''
                    ) AS working_directory
             FROM roles r
             WHERE r.id = ?1 AND r.task_id = ?2",
            params![&role_id, &task_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                ))
            },
        ).optional()
        .map_err(|e| format!("Failed to load role for session restart: {}", e))?
        .ok_or_else(|| format!("Role not found for task: {}", role_id))?;

        let working_directory = resolve_restart_working_directory(&role_row.7)?;
        let session_id = format!("session-{}", Uuid::new_v4());
        let created_at = Utc::now().to_rfc3339();

        tx.execute(
            "INSERT INTO sessions (id, type, name, model, provider, working_directory, status, task_id, role_id, created_at, updated_at)
             VALUES (?1, 'task', ?2, ?3, ?4, ?5, 'initializing', ?6, ?7, ?8, ?8)",
            params![
                &session_id,
                &role_row.0,
                &role_row.2,
                &role_row.1,
                &working_directory,
                &task_id,
                &role_id,
                &created_at,
            ],
        )
        .map_err(|e| format!("Failed to insert restarted session: {}", e))?;

        tx.execute(
            "UPDATE roles SET active_session_id = ?1 WHERE id = ?2",
            params![&session_id, &role_id],
        )
        .map_err(|e| format!("Failed to update active session: {}", e))?;

        tx.commit()
            .map_err(|e| format!("Failed to commit restarted session: {}", e))?;

        (
            session_id,
            role_row.0,
            role_row.1,
            role_row.2,
            working_directory,
            role_row.3,
            role_row.4,
            role_row.5,
            role_row.6,
        )
    };

    let role = crate::api::RoleConfig {
        name: role_name.clone(),
        identity: String::new(),
        archetype_id: None,
        system_prompt_append: None,
        custom_system_prompt: None,
        model: model.clone(),
        provider: provider.clone(),
        handoff_enabled: false,
        display_order: 0,
    };

    let prompt_snapshot = PromptSnapshot {
        text: prompt_snapshot.unwrap_or_default(),
        source_type: prompt_source_type.unwrap_or_else(|| "persisted".to_string()),
        hash: prompt_hash.unwrap_or_default(),
        contract_version: prompt_contract_version.unwrap_or_default(),
    };

    if let Err(error) = create_claurst_session_with_retry(&session_id, &role, &prompt_snapshot, &working_directory, 3).await {
        if let Ok(pool) = get_pool() {
            if let Ok(conn) = pool.get() {
                let _ = conn.execute("DELETE FROM sessions WHERE id = ?1", params![&session_id]);
                let _ = conn.execute(
                    "UPDATE roles
                     SET active_session_id = (
                         SELECT s.id
                         FROM sessions s
                         WHERE s.role_id = ?1
                         ORDER BY s.created_at DESC, s.id DESC
                         LIMIT 1
                     )
                     WHERE id = ?1",
                    params![&role_id],
                );
            }
        }

        return Err(format!("Failed to create restarted Claurst session for role {}: {}", role_name, error));
    }

    create_task_session_storage(
        &session_id,
        &working_directory,
        &provider,
        &role_name,
        &model,
    )?;

    let pool = get_pool()?;
    let conn = pool
        .get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    conn.execute(
        "UPDATE sessions SET status = 'ready' WHERE id = ?1",
        params![&session_id],
    )
    .map_err(|e| format!("Failed to update restarted session status: {}", e))?;

    crate::api::get_task(task_id).await
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
    role_context: Option<&RolePromptContext>,
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
            role_context,
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
            role_context,
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
