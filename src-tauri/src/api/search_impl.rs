use rusqlite::params;
use crate::api::{Message, search::MessageSearchResult};
use crate::database::get_pool;

pub async fn search_messages(
    query: String,
    limit: Option<u32>,
) -> Result<Vec<MessageSearchResult>, String> {
    let pool = get_pool()?;
    let conn = pool.get()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let limit = limit.unwrap_or(50);

    let results = {
        let mut stmt = conn.prepare(
            "SELECT
                m.id, m.session_id, m.role, m.content, m.created_at, m.request_id, m.is_streaming,
                s.name as session_name, s.type as session_type,
                t.name as task_name,
                r.name as role_name,
                snippet(messages_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
                bm25(messages_fts) as rank
             FROM messages_fts
             JOIN messages m ON messages_fts.message_id = m.id
             JOIN sessions s ON m.session_id = s.id
             LEFT JOIN tasks t ON s.task_id = t.id
             LEFT JOIN roles r ON s.role_id = r.id
             WHERE messages_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2"
        ).map_err(|e| format!("Failed to prepare search query: {}", e))?;

        let rows = stmt.query_map(params![&query, limit], |row| {
            Ok(MessageSearchResult {
                message: Message {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    created_at: row.get(4)?,
                    request_id: row.get(5)?,
                    is_streaming: row.get(6)?,
                },
                session_name: row.get(7)?,
                session_type: row.get(8)?,
                task_name: row.get(9)?,
                role_name: row.get(10)?,
                snippet: row.get(11)?,
                rank: row.get(12)?,
            })
        }).map_err(|e| format!("Failed to execute search: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect search results: {}", e))?
    };

    Ok(results)
}
