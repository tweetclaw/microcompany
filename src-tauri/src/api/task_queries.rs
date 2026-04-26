use rusqlite::params;
use crate::api::{Task, TaskRole, TaskSummary, DeleteTaskResult, TaskUpdateRequest};
use crate::database::get_pool;
use chrono::Utc;

pub async fn get_task(task_id: String) -> Result<Task, String> {
    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let task_row = {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, icon, created_at, updated_at FROM tasks WHERE id = ?1"
        ).map_err(|e| format!("Failed to prepare query: {}", e))?;

        stmt.query_row(params![&task_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        }).map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("Task not found: {}", task_id),
            _ => format!("Failed to query task: {}", e),
        })?
    };

    let roles = {
        let mut role_stmt = conn.prepare(
            "SELECT r.id, r.name, r.identity, r.archetype_id, r.system_prompt_snapshot, r.model, r.provider, r.handoff_enabled, r.display_order, s.id, r.created_at
             FROM roles r
             JOIN sessions s ON s.role_id = r.id
             WHERE r.task_id = ?1
             ORDER BY r.display_order, r.created_at"
        ).map_err(|e| format!("Failed to prepare role query: {}", e))?;

        let rows = role_stmt.query_map(params![&task_id], |row| {
            Ok(TaskRole {
                id: row.get(0)?,
                name: row.get(1)?,
                identity: row.get(2)?,
                archetype_id: row.get(3)?,
                system_prompt_snapshot: row.get(4)?,
                model: row.get(5)?,
                provider: row.get(6)?,
                handoff_enabled: row.get(7)?,
                display_order: row.get(8)?,
                session_id: row.get(9)?,
                created_at: row.get(10)?,
            })
        }).map_err(|e| format!("Failed to query roles: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect roles: {}", e))?
    };

    Ok(Task {
        id: task_row.0,
        name: task_row.1,
        description: task_row.2,
        icon: task_row.3,
        roles,
        created_at: task_row.4,
        updated_at: task_row.5,
    })
}

pub async fn list_tasks() -> Result<Vec<TaskSummary>, String> {
    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let tasks = {
        let mut stmt = conn.prepare(
            "SELECT
                t.id,
                t.name,
                t.description,
                t.icon,
                COUNT(DISTINCT r.id) as role_count,
                COUNT(m.id) as total_messages,
                t.created_at,
                t.updated_at
             FROM tasks t
             LEFT JOIN roles r ON r.task_id = t.id
             LEFT JOIN sessions s ON s.task_id = t.id
             LEFT JOIN messages m ON m.session_id = s.id
             GROUP BY t.id
             ORDER BY t.created_at DESC"
        ).map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt.query_map([], |row| {
            Ok(TaskSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                icon: row.get(3)?,
                role_count: row.get(4)?,
                total_messages: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        }).map_err(|e| format!("Failed to query tasks: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect tasks: {}", e))?
    };

    Ok(tasks)
}

pub async fn update_task(
    task_id: String,
    updates: TaskUpdateRequest,
) -> Result<Task, String> {
    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let has_updates = updates.name.is_some() || updates.description.is_some() || updates.icon.is_some();
    if !has_updates {
        return get_task(task_id).await;
    }

    let updated_at = Utc::now().to_rfc3339();

    match (&updates.name, &updates.description, &updates.icon) {
        (Some(name), Some(desc), Some(icon)) => {
            conn.execute(
                "UPDATE tasks SET name = ?1, description = ?2, icon = ?3, updated_at = ?4 WHERE id = ?5",
                params![name, desc, icon, &updated_at, &task_id],
            )
        }
        (Some(name), Some(desc), None) => {
            conn.execute(
                "UPDATE tasks SET name = ?1, description = ?2, updated_at = ?3 WHERE id = ?4",
                params![name, desc, &updated_at, &task_id],
            )
        }
        (Some(name), None, Some(icon)) => {
            conn.execute(
                "UPDATE tasks SET name = ?1, icon = ?2, updated_at = ?3 WHERE id = ?4",
                params![name, icon, &updated_at, &task_id],
            )
        }
        (Some(name), None, None) => {
            conn.execute(
                "UPDATE tasks SET name = ?1, updated_at = ?2 WHERE id = ?3",
                params![name, &updated_at, &task_id],
            )
        }
        (None, Some(desc), Some(icon)) => {
            conn.execute(
                "UPDATE tasks SET description = ?1, icon = ?2, updated_at = ?3 WHERE id = ?4",
                params![desc, icon, &updated_at, &task_id],
            )
        }
        (None, Some(desc), None) => {
            conn.execute(
                "UPDATE tasks SET description = ?1, updated_at = ?2 WHERE id = ?3",
                params![desc, &updated_at, &task_id],
            )
        }
        (None, None, Some(icon)) => {
            conn.execute(
                "UPDATE tasks SET icon = ?1, updated_at = ?2 WHERE id = ?3",
                params![icon, &updated_at, &task_id],
            )
        }
        (None, None, None) => return get_task(task_id).await,
    }.map_err(|e| format!("Failed to update task: {}", e))?;

    get_task(task_id).await
}

pub async fn delete_task(task_id: String) -> Result<DeleteTaskResult, String> {
    let pool = get_pool()?;
    let mut conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let role_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM roles WHERE task_id = ?1",
        params![&task_id],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to count roles: {}", e))?;

    let session_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sessions WHERE task_id = ?1",
        params![&task_id],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to count sessions: {}", e))?;

    let message_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE task_id = ?1)",
        params![&task_id],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to count messages: {}", e))?;

    let session_ids: Vec<String> = {
        let mut stmt = conn.prepare("SELECT id FROM sessions WHERE task_id = ?1")
            .map_err(|e| format!("Failed to prepare session query: {}", e))?;

        let rows = stmt.query_map(params![&task_id], |row| row.get(0))
            .map_err(|e| format!("Failed to query sessions: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect session IDs: {}", e))?
    };

    let tx = conn.transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    tx.execute("DELETE FROM tasks WHERE id = ?1", params![&task_id])
        .map_err(|e| format!("Failed to delete task: {}", e))?;

    tx.commit()
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    for session_id in session_ids {
        let sid = session_id.clone();
        tokio::spawn(async move {
            if let Err(e) = super::task_impl::delete_claurst_session(&sid).await {
                eprintln!("Failed to cleanup Claurst session {}: {}", sid, e);
            }
        });
    }

    Ok(DeleteTaskResult {
        deleted_task_id: task_id,
        deleted_role_count: role_count,
        deleted_session_count: session_count,
        deleted_message_count: message_count,
    })
}
