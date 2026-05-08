use rusqlite::params;
use crate::api::{Message, MessageCreateRequest};
use crate::api::message::{ToolCallRecord, TimelineItem};
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

    let mut messages = {
        let mut stmt = conn.prepare(
            "SELECT id, session_id, role, content, created_at, request_id, is_streaming, tool_calls
             FROM messages
             WHERE session_id = ?1
             ORDER BY created_at ASC
             LIMIT ?2 OFFSET ?3"
        ).map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt.query_map(params![&session_id, limit, offset], |row| {
            let tool_calls_json: Option<String> = row.get(7)?;
            let tool_calls: Option<Vec<ToolCallRecord>> = tool_calls_json
                .and_then(|json| serde_json::from_str(&json).ok());

            Ok(Message {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                request_id: row.get(5)?,
                is_streaming: row.get(6)?,
                tool_calls,
                timeline: None, // Will be loaded separately
            })
        }).map_err(|e| format!("Failed to query messages: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect messages: {}", e))?
    };

    // Load timeline items for all messages in a single query (avoid N+1)
    if !messages.is_empty() {
        let message_ids: Vec<String> = messages.iter().map(|m| m.id.clone()).collect();

        // Validate message IDs format (defensive programming)
        for id in &message_ids {
            if !id.chars().all(|c| c.is_alphanumeric() || c == '-') {
                return Err(format!("Invalid message ID format: {}", id));
            }
        }

        let placeholders = message_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT id, message_id, type, timestamp, content, tool, action, status, result
             FROM timeline_items
             WHERE message_id IN ({})
             ORDER BY message_id, timestamp ASC",
            placeholders
        );

        let mut stmt = conn.prepare(&query)
            .map_err(|e| format!("Failed to prepare timeline query: {}", e))?;

        let timeline_items = stmt.query_map(
            rusqlite::params_from_iter(message_ids.iter()),
            |row| {
                Ok(TimelineItem {
                    id: row.get(0)?,
                    message_id: row.get(1)?,
                    item_type: row.get(2)?,
                    timestamp: row.get(3)?,
                    content: row.get(4)?,
                    tool: row.get(5)?,
                    action: row.get(6)?,
                    status: row.get(7)?,
                    result: row.get(8)?,
                })
            }
        ).map_err(|e| format!("Failed to query timeline items: {}", e))?;

        // Group timeline items by message_id
        let mut timeline_map: std::collections::HashMap<String, Vec<TimelineItem>> = std::collections::HashMap::new();
        for item_result in timeline_items {
            let item = item_result.map_err(|e| format!("Failed to collect timeline item: {}", e))?;
            timeline_map.entry(item.message_id.clone())
                .or_insert_with(Vec::new)
                .push(item);
        }

        // Assign timeline items to corresponding messages
        for message in &mut messages {
            if let Some(items) = timeline_map.remove(&message.id) {
                message.timeline = Some(items);
            }
        }
    }

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

    let tool_calls_json = message.tool_calls
        .as_ref()
        .and_then(|calls| serde_json::to_string(calls).ok());

    conn.execute(
        "INSERT INTO messages (id, session_id, role, content, created_at, request_id, is_streaming, tool_calls)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            &message_id,
            &message.session_id,
            &message.role,
            &message.content,
            &created_at,
            &message.request_id,
            &message.is_streaming,
            &tool_calls_json,
        ],
    ).map_err(|e| format!("Failed to insert message: {}", e))?;

    // Save timeline items if present
    if let Some(timeline_items) = message.timeline {
        for item in timeline_items {
            conn.execute(
                "INSERT INTO timeline_items (id, message_id, type, timestamp, content, tool, action, status, result)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    &item.id,
                    &message_id,
                    &item.item_type,
                    &item.timestamp,
                    &item.content,
                    &item.tool,
                    &item.action,
                    &item.status,
                    &item.result,
                ],
            ).map_err(|e| format!("Failed to insert timeline item: {}", e))?;
        }
    }

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
