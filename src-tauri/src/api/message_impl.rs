use rusqlite::params;
use crate::api::{Message, MessageCreateRequest};
use crate::database::get_pool;
use uuid::Uuid;
use chrono::Utc;

pub async fn get_messages(
    session_id: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<Message>, String> {
    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let session_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = ?1)",
        params![&session_id],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to verify session: {}", e))?;

    if !session_exists {
        return Err(format!("Session not found: {}", session_id));
    }

    let limit = limit.unwrap_or(100);
    let offset = offset.unwrap_or(0);

    let messages = {
        let mut stmt = conn.prepare(
            "SELECT id, session_id, role, content, created_at, request_id, is_streaming
             FROM messages
             WHERE session_id = ?1
             ORDER BY created_at ASC
             LIMIT ?2 OFFSET ?3"
        ).map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt.query_map(params![&session_id, limit, offset], |row| {
            Ok(Message {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                request_id: row.get(5)?,
                is_streaming: row.get(6)?,
            })
        }).map_err(|e| format!("Failed to query messages: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect messages: {}", e))?
    };

    Ok(messages)
}

pub async fn save_message(message: MessageCreateRequest) -> Result<String, String> {
    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let session_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = ?1)",
        params![&message.session_id],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to verify session: {}", e))?;

    if !session_exists {
        return Err(format!("Session not found: {}", message.session_id));
    }

    let message_id = format!("msg-{}", Uuid::new_v4());
    let created_at = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO messages (id, session_id, role, content, created_at, request_id, is_streaming)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            &message_id,
            &message.session_id,
            &message.role,
            &message.content,
            &created_at,
            &message.request_id,
            &message.is_streaming,
        ],
    ).map_err(|e| format!("Failed to insert message: {}", e))?;

    Ok(message_id)
}

pub async fn update_message_content(
    message_id: String,
    content: String,
    is_streaming: bool,
) -> Result<(), String> {
    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let rows_affected = conn.execute(
        "UPDATE messages SET content = ?1, is_streaming = ?2 WHERE id = ?3",
        params![&content, &is_streaming, &message_id],
    ).map_err(|e| format!("Failed to update message: {}", e))?;

    if rows_affected == 0 {
        return Err(format!("Message not found: {}", message_id));
    }

    Ok(())
}
