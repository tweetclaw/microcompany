use rusqlite::params;
use crate::api::{Session, SessionSummary, DeleteSessionResult};
use crate::database::get_pool;
use crate::config::AppConfig;
use crate::claurst::ClaurstSession;
use uuid::Uuid;
use chrono::Utc;

pub async fn create_normal_session(
    name: String,
    model: String,
    provider: String,
    working_directory: String,
) -> Result<String, String> {
    let session_id = format!("session-{}", Uuid::new_v4());
    let created_at = Utc::now().to_rfc3339();

    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    conn.execute(
        "INSERT INTO sessions (id, type, name, model, provider, working_directory, status, created_at, updated_at)
         VALUES (?1, 'normal', ?2, ?3, ?4, ?5, 'initializing', ?6, ?6)",
        params![&session_id, &name, &model, &provider, &working_directory, &created_at],
    ).map_err(|e| format!("Failed to insert session: {}", e))?;

    let config = AppConfig::load()
        .map_err(|e| format!("Failed to load config: {}", e))?;

    let provider_config = config.providers.iter()
        .find(|p| p.id == provider)
        .ok_or_else(|| format!("Provider '{}' not found in config", provider))?;

    if provider_config.api_key.is_empty() {
        return Err(format!("API key not configured for provider '{}'", provider));
    }

    match ClaurstSession::new(
        session_id.clone(),
        working_directory.into(),
        provider_config.api_key.clone(),
        model.clone(),
        provider_config.base_url.clone(),
    ) {
        Ok(_) => {
            conn.execute(
                "UPDATE sessions SET status = 'ready' WHERE id = ?1",
                params![&session_id],
            ).map_err(|e| format!("Failed to update session status: {}", e))?;

            Ok(session_id)
        }
        Err(e) => {
            conn.execute("DELETE FROM sessions WHERE id = ?1", params![&session_id])
                .map_err(|e| format!("Failed to rollback session: {}", e))?;
            Err(format!("Failed to create Claurst session: {}", e))
        }
    }
}

pub async fn get_session(session_id: String) -> Result<Session, String> {
    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT id, type, name, model, provider, working_directory, status, error_message, task_id, role_id, created_at, updated_at
         FROM sessions
         WHERE id = ?1"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

    let session = stmt.query_row(params![&session_id], |row| {
        Ok(Session {
            id: row.get(0)?,
            r#type: row.get(1)?,
            name: row.get(2)?,
            model: row.get(3)?,
            provider: row.get(4)?,
            working_directory: row.get(5)?,
            status: row.get(6)?,
            error_message: row.get(7)?,
            task_id: row.get(8)?,
            role_id: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    }).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("Session not found: {}", session_id),
        _ => format!("Failed to query session: {}", e),
    })?;

    Ok(session)
}

pub async fn list_normal_sessions() -> Result<Vec<SessionSummary>, String> {
    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let sessions = {
        let mut stmt = conn.prepare(
            "SELECT
                s.id,
                s.type,
                s.name,
                s.model,
                s.provider,
                s.status,
                COUNT(m.id) as message_count,
                s.created_at,
                s.updated_at
             FROM sessions s
             LEFT JOIN messages m ON m.session_id = s.id
             WHERE s.type = 'normal'
             GROUP BY s.id
             ORDER BY s.created_at DESC"
        ).map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt.query_map([], |row| {
            Ok(SessionSummary {
                id: row.get(0)?,
                r#type: row.get(1)?,
                name: row.get(2)?,
                model: row.get(3)?,
                provider: row.get(4)?,
                status: row.get(5)?,
                message_count: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        }).map_err(|e| format!("Failed to query sessions: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect sessions: {}", e))?
    };

    Ok(sessions)
}

pub async fn delete_session(session_id: String) -> Result<DeleteSessionResult, String> {
    let pool = get_pool()?;
    let mut conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let session_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = ?1)",
        params![&session_id],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to verify session: {}", e))?;

    if !session_exists {
        return Err(format!("Session not found: {}", session_id));
    }

    let message_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM messages WHERE session_id = ?1",
        params![&session_id],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to count messages: {}", e))?;

    let tx = conn.transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    tx.execute("DELETE FROM sessions WHERE id = ?1", params![&session_id])
        .map_err(|e| format!("Failed to delete session: {}", e))?;

    tx.commit()
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    let sid = session_id.clone();
    tokio::spawn(async move {
        if let Err(e) = delete_claurst_session(&sid).await {
            eprintln!("Failed to cleanup Claurst session {}: {}", sid, e);
        }
    });

    Ok(DeleteSessionResult {
        deleted_session_id: session_id,
        deleted_message_count: message_count,
    })
}

async fn delete_claurst_session(session_id: &str) -> Result<(), String> {
    use crate::storage::ConversationStorage;

    let storage = ConversationStorage::new()
        .map_err(|e| format!("Failed to initialize storage: {}", e))?;

    storage.delete_session(session_id)
        .map_err(|e| format!("Failed to delete session storage: {}", e))?;

    Ok(())
}
