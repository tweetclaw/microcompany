use rusqlite::params;
use crate::api::statistics::{Statistics, DailyMessageCount, TopSession, TaskStatistics, RoleMessageCount};
use crate::database::get_pool;

pub async fn get_statistics() -> Result<Statistics, String> {
    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let total_tasks: i32 = conn.query_row(
        "SELECT COUNT(*) FROM tasks",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to count tasks: {}", e))?;

    let total_sessions: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sessions",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to count sessions: {}", e))?;

    let total_messages: i32 = conn.query_row(
        "SELECT COUNT(*) FROM messages",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to count messages: {}", e))?;

    let normal_sessions: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sessions WHERE type = 'normal'",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to count normal sessions: {}", e))?;

    let task_sessions: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sessions WHERE type = 'task'",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to count task sessions: {}", e))?;

    let messages_by_day = {
        let mut stmt = conn.prepare(
            "SELECT DATE(created_at) as date, COUNT(*) as count
             FROM messages
             GROUP BY DATE(created_at)
             ORDER BY date DESC
             LIMIT 30"
        ).map_err(|e| format!("Failed to prepare messages by day query: {}", e))?;

        let rows = stmt.query_map([], |row| {
            Ok(DailyMessageCount {
                date: row.get(0)?,
                count: row.get(1)?,
            })
        }).map_err(|e| format!("Failed to query messages by day: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect messages by day: {}", e))?
    };

    let top_sessions = {
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.type, COUNT(m.id) as message_count
             FROM sessions s
             INNER JOIN messages m ON m.session_id = s.id
             GROUP BY s.id
             ORDER BY message_count DESC
             LIMIT 10"
        ).map_err(|e| format!("Failed to prepare top sessions query: {}", e))?;

        let rows = stmt.query_map([], |row| {
            Ok(TopSession {
                session_id: row.get(0)?,
                session_name: row.get(1)?,
                session_type: row.get(2)?,
                message_count: row.get(3)?,
            })
        }).map_err(|e| format!("Failed to query top sessions: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect top sessions: {}", e))?
    };

    Ok(Statistics {
        total_tasks,
        total_sessions,
        total_messages,
        normal_sessions,
        task_sessions,
        messages_by_day,
        top_sessions,
    })
}

pub async fn get_task_statistics(task_id: String) -> Result<TaskStatistics, String> {
    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let (task_name, created_at): (String, String) = conn.query_row(
        "SELECT name, created_at FROM tasks WHERE id = ?1",
        params![&task_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("Task not found: {}", task_id),
        _ => format!("Failed to query task: {}", e),
    })?;

    let total_messages: i32 = conn.query_row(
        "SELECT COUNT(*) FROM messages
         WHERE session_id IN (SELECT id FROM sessions WHERE task_id = ?1)",
        params![&task_id],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to count messages: {}", e))?;

    let messages_by_role = {
        let mut stmt = conn.prepare(
            "SELECT r.id, r.name, COUNT(m.id) as message_count
             FROM roles r
             LEFT JOIN sessions s ON s.role_id = r.id
             LEFT JOIN messages m ON m.session_id = s.id
             WHERE r.task_id = ?1
             GROUP BY r.id
             ORDER BY message_count DESC"
        ).map_err(|e| format!("Failed to prepare messages by role query: {}", e))?;

        let rows = stmt.query_map(params![&task_id], |row| {
            Ok(RoleMessageCount {
                role_id: row.get(0)?,
                role_name: row.get(1)?,
                message_count: row.get(2)?,
            })
        }).map_err(|e| format!("Failed to query messages by role: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect messages by role: {}", e))?
    };

    let messages_by_day = {
        let mut stmt = conn.prepare(
            "SELECT DATE(m.created_at) as date, COUNT(*) as count
             FROM messages m
             JOIN sessions s ON m.session_id = s.id
             WHERE s.task_id = ?1
             GROUP BY DATE(m.created_at)
             ORDER BY date DESC
             LIMIT 30"
        ).map_err(|e| format!("Failed to prepare messages by day query: {}", e))?;

        let rows = stmt.query_map(params![&task_id], |row| {
            Ok(DailyMessageCount {
                date: row.get(0)?,
                count: row.get(1)?,
            })
        }).map_err(|e| format!("Failed to query messages by day: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect messages by day: {}", e))?
    };

    Ok(TaskStatistics {
        task_id,
        task_name,
        total_messages,
        messages_by_role,
        messages_by_day,
        created_at,
    })
}
