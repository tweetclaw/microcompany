use rusqlite::{params, OptionalExtension};
use uuid::Uuid;
use chrono::Utc;

use crate::api::task::RoleConfig;
use crate::api::template::{
    CreateFromTemplateRequest,
    SaveTemplateRequest,
    SystemTemplate,
    TemplateDraft,
    TemplateRole,
    TemplateSummary,
    TemplateWarning,
    UpdateTemplateRequest,
    UserTemplate,
};
use crate::database::get_pool;

#[derive(Debug)]
struct TemplateRow {
    id: String,
    name: String,
    description: String,
    icon: String,
    category: Option<String>,
    source: String,
    pm_first_workflow: bool,
    tags_json: String,
    source_path: Option<String>,
    source_task_id: Option<String>,
    created_at: String,
    updated_at: String,
}

fn parse_tags(tags_json: &str) -> Vec<String> {
    serde_json::from_str(tags_json).unwrap_or_else(|err| {
        println!("[template_api] WARN: Failed to parse tags_json='{}': {}", tags_json, err);
        vec![]
    })
}

fn load_template_row(conn: &rusqlite::Connection, template_id: &str) -> Result<Option<TemplateRow>, String> {
    conn.query_row(
        "SELECT id, name, description, icon, category, source, pm_first_workflow, tags_json, source_path, source_task_id, created_at, updated_at
         FROM task_templates
         WHERE id = ?1",
        params![template_id],
        |row| {
            Ok(TemplateRow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                icon: row.get(3)?,
                category: row.get(4)?,
                source: row.get(5)?,
                pm_first_workflow: row.get::<_, i32>(6)? != 0,
                tags_json: row.get(7)?,
                source_path: row.get(8)?,
                source_task_id: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        },
    )
    .optional()
    .map_err(|e| format!("Failed to load template row {}: {}", template_id, e))
}

fn load_template_roles(conn: &rusqlite::Connection, template_id: &str) -> Result<Vec<TemplateRole>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT name, identity, archetype_id, system_prompt_append, custom_system_prompt, model, provider, handoff_enabled
             FROM task_template_roles
             WHERE template_id = ?1
             ORDER BY display_order ASC",
        )
        .map_err(|e| format!("Failed to prepare template role query: {}", e))?;

    let rows = stmt
        .query_map(params![template_id], |row| {
            Ok(TemplateRole {
                name: row.get(0)?,
                identity: row.get(1)?,
                archetype_id: row.get(2)?,
                system_prompt_append: row.get(3)?,
                custom_system_prompt: row.get(4)?,
                model: row.get(5)?,
                provider: row.get(6)?,
                handoff_enabled: row.get::<_, i32>(7)? != 0,
            })
        })
        .map_err(|e| format!("Failed to query template roles: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect template roles: {}", e))
}

pub async fn list_system_templates() -> Result<Vec<SystemTemplate>, String> {
    println!("[template_api] list_system_templates: start");
    let pool = get_pool()?;
    let conn = pool
        .get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, icon, category, source, pm_first_workflow, tags_json, source_path, source_task_id, created_at, updated_at
             FROM task_templates
             WHERE source = 'system'
             ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Failed to prepare system templates query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(TemplateRow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                icon: row.get(3)?,
                category: row.get(4)?,
                source: row.get(5)?,
                pm_first_workflow: row.get::<_, i32>(6)? != 0,
                tags_json: row.get(7)?,
                source_path: row.get(8)?,
                source_task_id: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| format!("Failed to query system templates: {}", e))?;

    let template_rows = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect system templates: {}", e))?;

    let mut templates = Vec::with_capacity(template_rows.len());
    for row in template_rows {
        let roles = load_template_roles(&conn, &row.id)?;
        templates.push(SystemTemplate {
            id: row.id,
            name: row.name,
            description: row.description,
            icon: row.icon,
            category: row.category.unwrap_or_default(),
            pm_first_workflow: row.pm_first_workflow,
            roles,
            tags: parse_tags(&row.tags_json),
            source_path: row.source_path.unwrap_or_default(),
        });
    }

    println!("[template_api] list_system_templates: returning {} templates", templates.len());
    Ok(templates)
}

pub async fn get_system_template(template_id: String) -> Result<Option<SystemTemplate>, String> {
    println!("[template_api] get_system_template: template_id={}", template_id);
    let pool = get_pool()?;
    let conn = pool
        .get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let Some(row) = load_template_row(&conn, &template_id)? else {
        println!("[template_api] get_system_template: template not found: {}", template_id);
        return Ok(None);
    };

    if row.source != "system" {
        return Err(format!("Template {} is not a system template", template_id));
    }

    let roles = load_template_roles(&conn, &template_id)?;
    let template = SystemTemplate {
        id: row.id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        category: row.category.unwrap_or_default(),
        pm_first_workflow: row.pm_first_workflow,
        roles,
        tags: parse_tags(&row.tags_json),
        source_path: row.source_path.unwrap_or_default(),
    };

    println!("[template_api] get_system_template: found template {} with {} roles", template.id, template.roles.len());
    Ok(Some(template))
}

pub async fn list_user_templates() -> Result<Vec<UserTemplate>, String> {
    println!("[template_api] list_user_templates: start");
    let pool = get_pool()?;
    let conn = pool
        .get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, icon, category, source, pm_first_workflow, tags_json, source_path, source_task_id, created_at, updated_at
             FROM task_templates
             WHERE source = 'user'
             ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("Failed to prepare user templates query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(TemplateRow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                icon: row.get(3)?,
                category: row.get(4)?,
                source: row.get(5)?,
                pm_first_workflow: row.get::<_, i32>(6)? != 0,
                tags_json: row.get(7)?,
                source_path: row.get(8)?,
                source_task_id: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| format!("Failed to query user templates: {}", e))?;

    let template_rows = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect user templates: {}", e))?;

    let mut templates = Vec::with_capacity(template_rows.len());
    for row in template_rows {
        let roles = load_template_roles(&conn, &row.id)?;
        templates.push(UserTemplate {
            id: row.id,
            name: row.name,
            description: row.description,
            icon: row.icon,
            pm_first_workflow: row.pm_first_workflow,
            roles,
            source_task_id: row.source_task_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
        });
    }

    println!("[template_api] list_user_templates: returning {} templates", templates.len());
    Ok(templates)
}

pub async fn update_template(template_id: String, updates: UpdateTemplateRequest) -> Result<UserTemplate, String> {
    println!("[template_api] update_template: template_id={} roles_provided={} has_name={} has_description={} has_icon={}", template_id, updates.roles.as_ref().map(|r| r.len()).unwrap_or(0), updates.name.is_some(), updates.description.is_some(), updates.icon.is_some());
    let pool = get_pool()?;
    let mut conn = pool
        .get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let Some(existing) = load_template_row(&conn, &template_id)? else {
        return Err(format!("Template not found: {}", template_id));
    };

    if existing.source != "user" {
        println!("[template_api] update_template: rejected non-user template update template_id={} source={}", template_id, existing.source);
        return Err("System templates are read-only. Duplicate the template before editing.".to_string());
    }

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start template update transaction: {}", e))?;

    tx.execute(
        "UPDATE task_templates
         SET name = COALESCE(?2, name),
             description = COALESCE(?3, description),
             icon = COALESCE(?4, icon),
             updated_at = ?5
         WHERE id = ?1",
        params![template_id, updates.name, updates.description, updates.icon, Utc::now().to_rfc3339()],
    )
    .map_err(|e| format!("Failed to update template row: {}", e))?;

    if let Some(roles) = &updates.roles {
        println!("[template_api] update_template: replacing template roles template_id={} role_count={}", template_id, roles.len());
        tx.execute(
            "DELETE FROM task_template_roles WHERE template_id = ?1",
            params![template_id],
        )
        .map_err(|e| format!("Failed to clear template roles: {}", e))?;

        let now = Utc::now().to_rfc3339();
        for (index, role) in roles.iter().enumerate() {
            let role_id = format!("{}-role-{}-{}", template_id, index + 1, Uuid::new_v4().simple());
            tx.execute(
                "INSERT INTO task_template_roles
                 (id, template_id, name, identity, archetype_id, system_prompt_append, custom_system_prompt, model, provider, handoff_enabled, display_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
                params![
                    role_id,
                    template_id,
                    role.name,
                    role.identity,
                    role.archetype_id,
                    role.system_prompt_append,
                    role.custom_system_prompt,
                    role.model,
                    role.provider,
                    if role.handoff_enabled { 1 } else { 0 },
                    index as i32,
                    &now,
                ],
            )
            .map_err(|e| format!("Failed to insert template role: {}", e))?;
        }
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit template update: {}", e))?;

    let refreshed = load_template_row(&conn, &template_id)?
        .ok_or_else(|| format!("Template disappeared after update: {}", template_id))?;
    let refreshed_roles = load_template_roles(&conn, &template_id)?;

    println!("[template_api] update_template: updated template {} source={} final_role_count={}", template_id, existing.source, refreshed_roles.len());
    Ok(UserTemplate {
        id: refreshed.id,
        name: refreshed.name,
        description: refreshed.description,
        icon: refreshed.icon,
        pm_first_workflow: refreshed.pm_first_workflow,
        roles: refreshed_roles,
        source_task_id: refreshed.source_task_id,
        created_at: refreshed.created_at,
        updated_at: refreshed.updated_at,
    })
}

pub async fn duplicate_template_as_user(template_id: String) -> Result<UserTemplate, String> {
    println!("[template_api] duplicate_template_as_user: source_template_id={}", template_id);
    let pool = get_pool()?;
    let mut conn = pool
        .get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let Some(source_template) = load_template_row(&conn, &template_id)? else {
        return Err(format!("Template not found: {}", template_id));
    };

    let source_roles = load_template_roles(&conn, &template_id)?;
    println!("[template_api] duplicate_template_as_user: loaded source template template_id={} source={} role_count={}", source_template.id, source_template.source, source_roles.len());
    let now = Utc::now().to_rfc3339();
    let new_template_id = format!("user-tpl-{}", Uuid::new_v4());
    let duplicated_name = format!("{} (Copy)", source_template.name);

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start duplicate_template_as_user transaction: {}", e))?;

    tx.execute(
        "INSERT INTO task_templates
         (id, name, description, icon, category, source, pm_first_workflow, tags_json, source_path, source_task_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, NULL, 'user', ?5, ?6, NULL, NULL, ?7, ?7)",
        params![
            &new_template_id,
            &duplicated_name,
            &source_template.description,
            &source_template.icon,
            if source_template.pm_first_workflow { 1 } else { 0 },
            &source_template.tags_json,
            &now,
        ],
    )
    .map_err(|e| format!("Failed to insert duplicated user template: {}", e))?;

    for (index, role) in source_roles.iter().enumerate() {
        let role_id = format!("{}-role-{}", new_template_id, Uuid::new_v4());
        tx.execute(
            "INSERT INTO task_template_roles
             (id, template_id, name, identity, archetype_id, system_prompt_append, custom_system_prompt, model, provider, handoff_enabled, display_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
            params![
                role_id,
                &new_template_id,
                &role.name,
                &role.identity,
                &role.archetype_id,
                &role.system_prompt_append,
                &role.custom_system_prompt,
                &role.model,
                &role.provider,
                if role.handoff_enabled { 1 } else { 0 },
                index as i32,
                &now,
            ],
        )
        .map_err(|e| format!("Failed to insert duplicated template role: {}", e))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit duplicate_template_as_user transaction: {}", e))?;

    let duplicated_roles = load_template_roles(&conn, &new_template_id)?;
    println!("[template_api] duplicate_template_as_user: duplicated template created new_template_id={} role_count={}", new_template_id, duplicated_roles.len());
    Ok(UserTemplate {
        id: new_template_id,
        name: duplicated_name,
        description: source_template.description,
        icon: source_template.icon,
        pm_first_workflow: source_template.pm_first_workflow,
        roles: duplicated_roles,
        source_task_id: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

pub async fn delete_user_template(template_id: String) -> Result<(), String> {
    println!("[template_api] delete_user_template: template_id={}", template_id);
    let pool = get_pool()?;
    let mut conn = pool
        .get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let Some(existing) = load_template_row(&conn, &template_id)? else {
        return Err(format!("Template not found: {}", template_id));
    };

    if existing.source != "user" {
        println!("[template_api] delete_user_template: rejected non-user template deletion template_id={} source={}", template_id, existing.source);
        return Err("Only user templates can be deleted.".to_string());
    }

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start delete_user_template transaction: {}", e))?;

    tx.execute(
        "DELETE FROM task_template_roles WHERE template_id = ?1",
        params![&template_id],
    )
    .map_err(|e| format!("Failed to delete template roles: {}", e))?;

    let deleted = tx
        .execute(
            "DELETE FROM task_templates WHERE id = ?1 AND source = 'user'",
            params![&template_id],
        )
        .map_err(|e| format!("Failed to delete template row: {}", e))?;

    if deleted == 0 {
        return Err(format!("User template not found or already deleted: {}", template_id));
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit delete_user_template transaction: {}", e))?;

    println!("[template_api] delete_user_template: deleted template_id={} template_name={}", template_id, existing.name);
    Ok(())
}

pub async fn save_task_as_template(request: SaveTemplateRequest) -> Result<UserTemplate, String> {
    println!("[template_api] save_task_as_template: source_task_id={} name={}", request.source_task_id, request.name);
    let pool = get_pool()?;
    let mut conn = pool
        .get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let task_row: Option<(String, String, bool)> = conn
        .query_row(
            "SELECT icon, COALESCE(description, ''), pm_first_workflow FROM tasks WHERE id = ?1",
            params![&request.source_task_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get::<_, i32>(2)? != 0)),
        )
        .optional()
        .map_err(|e| format!("Failed to query source task: {}", e))?;

    let Some((task_icon, task_description, pm_first_workflow)) = task_row else {
        return Err(format!("Source task not found: {}", request.source_task_id));
    };

    let source_roles = {
        let mut role_stmt = conn
            .prepare(
                "SELECT name, identity, archetype_id, system_prompt_append, custom_system_prompt, model, provider, handoff_enabled, display_order
                 FROM roles
                 WHERE task_id = ?1
                 ORDER BY display_order ASC",
            )
            .map_err(|e| format!("Failed to prepare source roles query: {}", e))?;

        let rows = role_stmt
            .query_map(params![&request.source_task_id], |row| {
                Ok(RoleConfig {
                    name: row.get(0)?,
                    identity: row.get(1)?,
                    archetype_id: row.get(2)?,
                    system_prompt_append: row.get(3)?,
                    custom_system_prompt: row.get(4)?,
                    model: row.get(5)?,
                    provider: row.get(6)?,
                    handoff_enabled: row.get::<_, i32>(7)? != 0,
                    display_order: row.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to query source task roles: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect source task roles: {}", e))?
    };

    let now = Utc::now().to_rfc3339();
    let template_id = format!("user-tpl-{}", Uuid::new_v4());
    let template_icon = if request.icon.trim().is_empty() { task_icon } else { request.icon.clone() };
    let template_description = if request.description.trim().is_empty() { task_description } else { request.description.clone() };

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start save_task_as_template transaction: {}", e))?;

    tx.execute(
        "INSERT INTO task_templates
         (id, name, description, icon, category, source, pm_first_workflow, tags_json, source_path, source_task_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, NULL, 'user', ?5, '[]', NULL, ?6, ?7, ?7)",
        params![
            &template_id,
            &request.name,
            &template_description,
            &template_icon,
            if pm_first_workflow { 1 } else { 0 },
            &request.source_task_id,
            &now,
        ],
    )
    .map_err(|e| format!("Failed to insert user template: {}", e))?;

    for role in source_roles.iter() {
        let role_id = format!("{}-role-{}", template_id, Uuid::new_v4());
        tx.execute(
            "INSERT INTO task_template_roles
             (id, template_id, name, identity, archetype_id, system_prompt_append, custom_system_prompt, model, provider, handoff_enabled, display_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
            params![
                role_id,
                &template_id,
                &role.name,
                &role.identity,
                &role.archetype_id,
                &role.system_prompt_append,
                &role.custom_system_prompt,
                &role.model,
                &role.provider,
                if role.handoff_enabled { 1 } else { 0 },
                role.display_order,
                &now,
            ],
        )
        .map_err(|e| format!("Failed to insert saved template role: {}", e))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit save_task_as_template transaction: {}", e))?;

    let roles = load_template_roles(&conn, &template_id)?;
    println!("[template_api] save_task_as_template: saved template_id={} role_count={}", template_id, roles.len());
    Ok(UserTemplate {
        id: template_id,
        name: request.name,
        description: template_description,
        icon: template_icon,
        pm_first_workflow,
        roles,
        source_task_id: Some(request.source_task_id),
        created_at: now.clone(),
        updated_at: now,
    })
}

pub async fn list_all_template_summaries() -> Result<Vec<TemplateSummary>, String> {
    println!("[template_api] list_all_template_summaries: start");
    let pool = get_pool()?;
    let conn = pool
        .get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name, t.description, t.icon, t.category, t.source, COUNT(r.id) as role_count, t.tags_json, t.created_at, t.updated_at
             FROM task_templates t
             LEFT JOIN task_template_roles r ON r.template_id = t.id
             GROUP BY t.id, t.name, t.description, t.icon, t.category, t.source, t.tags_json, t.created_at, t.updated_at
             ORDER BY CASE WHEN t.source = 'system' THEN 0 ELSE 1 END, t.updated_at DESC, t.created_at ASC",
        )
        .map_err(|e| format!("Failed to prepare template summaries query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(TemplateSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                icon: row.get(3)?,
                category: row.get(4)?,
                source: row.get(5)?,
                role_count: row.get(6)?,
                tags: parse_tags(&row.get::<_, String>(7)?),
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| format!("Failed to query template summaries: {}", e))?;

    let summaries = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect template summaries: {}", e))?;

    println!("[template_api] list_all_template_summaries: returning {} summaries", summaries.len());
    Ok(summaries)
}

pub async fn resolve_template_draft(request: CreateFromTemplateRequest) -> Result<TemplateDraft, String> {
    println!("[template_api] resolve_template_draft: template_id={} source={} task_name={}", request.template_id, request.template_source, request.task_name);
    let pool = get_pool()?;
    let conn = pool
        .get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let Some(row) = load_template_row(&conn, &request.template_id)? else {
        return Err(format!("Template not found: {}", request.template_id));
    };

    let mut roles = load_template_roles(&conn, &request.template_id)?;
    if let Some(role_overrides) = request.role_overrides {
        for role in roles.iter_mut() {
            if let Some(override_value) = role_overrides.get(&role.name) {
                if let Some(provider) = &override_value.provider {
                    role.provider = provider.clone();
                }
            }
        }
    }

    let warnings = roles
        .iter()
        .enumerate()
        .flat_map(|(index, role)| {
            let mut role_warnings = Vec::new();
            if role.provider.trim().is_empty() {
                role_warnings.push(TemplateWarning {
                    r#type: "missing_provider".to_string(),
                    role_index: index as i32,
                    role_name: role.name.clone(),
                    message: format!("Role '{}' is missing provider", role.name),
                    blocking: true,
                });
            }
            if role.model.trim().is_empty() {
                role_warnings.push(TemplateWarning {
                    r#type: "missing_model".to_string(),
                    role_index: index as i32,
                    role_name: role.name.clone(),
                    message: format!("Role '{}' is missing model", role.name),
                    blocking: true,
                });
            }
            role_warnings
        })
        .collect::<Vec<_>>();

    Ok(TemplateDraft {
        task_name: if request.task_name.trim().is_empty() { row.name } else { request.task_name },
        description: row.description,
        icon: row.icon,
        pm_first_workflow: row.pm_first_workflow,
        roles,
        warnings,
    })
}
