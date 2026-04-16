use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredMessage {
    pub role: String,
    pub content: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    pub session_id: String,
    pub working_directory: String,
    pub title: String,
    pub created_at: i64,
    pub messages: Vec<StoredMessage>,
    pub provider_id: Option<String>,
    pub provider_name: Option<String>,
    pub model: Option<String>,
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub session_id: String,
    pub working_directory: String,
    pub title: String,
    pub message_count: usize,
    pub last_activity: i64,
    pub created_at: i64,
    pub provider_id: Option<String>,
    pub provider_name: Option<String>,
    pub model: Option<String>,
}

pub struct ConversationStorage {
    storage_dir: PathBuf,
}

impl ConversationStorage {
    pub fn new() -> anyhow::Result<Self> {
        let home_dir = dirs::home_dir()
            .ok_or_else(|| anyhow::anyhow!("Failed to get home directory"))?;

        let storage_dir = home_dir.join(".microcompany").join("conversations");

        // Create storage directory if it doesn't exist
        if !storage_dir.exists() {
            fs::create_dir_all(&storage_dir)?;
        }

        Ok(Self { storage_dir })
    }

    /// Get the conversation file path for a session
    fn get_session_file(&self, session_id: &str) -> PathBuf {
        self.storage_dir.join(format!("{}.json", session_id))
    }

    /// Generate a title from the first user message
    fn generate_title(first_message: &str) -> String {
        let max_length = 30;
        let trimmed = first_message.trim();

        if trimmed.len() <= max_length {
            trimmed.to_string()
        } else {
            // Find the last space before max_length to avoid cutting words
            let truncated = &trimmed[..max_length];
            if let Some(last_space) = truncated.rfind(' ') {
                format!("{}...", &trimmed[..last_space])
            } else {
                format!("{}...", truncated)
            }
        }
    }

    /// Create a new session
    pub fn create_session(
        &self,
        working_dir: &Path,
        provider_id: Option<String>,
        provider_name: Option<String>,
        model: Option<String>,
        base_url: Option<String>,
    ) -> anyhow::Result<String> {
        let session_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();

        let session_data = SessionData {
            session_id: session_id.clone(),
            working_directory: working_dir.to_string_lossy().to_string(),
            title: "Untitled".to_string(), // Will be updated when first message is sent
            created_at: now,
            messages: Vec::new(),
            provider_id,
            provider_name,
            model,
            base_url,
        };

        let file_path = self.get_session_file(&session_id);
        let json = serde_json::to_string_pretty(&session_data)?;
        fs::write(file_path, json)?;

        Ok(session_id)
    }

    /// Save a message to a session
    pub fn save_message(&self, session_id: &str, message: StoredMessage) -> anyhow::Result<()> {
        let file_path = self.get_session_file(session_id);

        if !file_path.exists() {
            return Err(anyhow::anyhow!("Session not found: {}", session_id));
        }

        let content = fs::read_to_string(&file_path)?;
        let mut session_data: SessionData = serde_json::from_str(&content)?;

        // Update title if this is the first user message
        if session_data.messages.is_empty() && message.role == "user" {
            session_data.title = Self::generate_title(&message.content);
        }

        session_data.messages.push(message);

        let json = serde_json::to_string_pretty(&session_data)?;
        fs::write(file_path, json)?;

        Ok(())
    }

    /// Load all messages for a session
    pub fn load_messages(&self, session_id: &str) -> anyhow::Result<Vec<StoredMessage>> {
        let file_path = self.get_session_file(session_id);

        if !file_path.exists() {
            return Err(anyhow::anyhow!("Session not found: {}", session_id));
        }

        let content = fs::read_to_string(file_path)?;
        let session_data: SessionData = serde_json::from_str(&content)?;

        Ok(session_data.messages)
    }

    /// Load session data
    pub fn load_session(&self, session_id: &str) -> anyhow::Result<SessionData> {
        let file_path = self.get_session_file(session_id);

        if !file_path.exists() {
            return Err(anyhow::anyhow!("Session not found: {}", session_id));
        }

        let content = fs::read_to_string(file_path)?;
        let session_data: SessionData = serde_json::from_str(&content)?;

        Ok(session_data)
    }

    /// Clear all messages for a session
    pub fn clear_messages(&self, session_id: &str) -> anyhow::Result<()> {
        let file_path = self.get_session_file(session_id);

        if !file_path.exists() {
            return Err(anyhow::anyhow!("Session not found: {}", session_id));
        }

        let content = fs::read_to_string(&file_path)?;
        let mut session_data: SessionData = serde_json::from_str(&content)?;

        session_data.messages.clear();

        let json = serde_json::to_string_pretty(&session_data)?;
        fs::write(file_path, json)?;

        Ok(())
    }

    /// List all sessions with their metadata
    pub fn list_all_sessions(&self, working_dir: Option<&str>) -> anyhow::Result<Vec<SessionInfo>> {
        let mut sessions = Vec::new();

        if !self.storage_dir.exists() {
            return Ok(sessions);
        }

        for entry in fs::read_dir(&self.storage_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                let content = fs::read_to_string(&path)?;

                if let Ok(session_data) = serde_json::from_str::<SessionData>(&content) {
                    if let Some(expected_working_dir) = working_dir {
                        if session_data.working_directory != expected_working_dir {
                            continue;
                        }
                    }

                    let last_activity = session_data.messages.last()
                        .map(|m| m.timestamp)
                        .unwrap_or(session_data.created_at);
                    let message_count = session_data.messages.len();

                    sessions.push(SessionInfo {
                        session_id: session_data.session_id,
                        working_directory: session_data.working_directory,
                        title: session_data.title,
                        message_count,
                        last_activity,
                        created_at: session_data.created_at,
                        provider_id: session_data.provider_id,
                        provider_name: session_data.provider_name,
                        model: session_data.model,
                    });
                }
            }
        }

        sessions.sort_by(|a, b| b.last_activity.cmp(&a.last_activity));

        Ok(sessions)
    }

    /// Delete a session by session ID
    pub fn delete_session(&self, session_id: &str) -> anyhow::Result<()> {
        let file_path = self.get_session_file(session_id);
        if file_path.exists() {
            fs::remove_file(file_path)?;
        }
        Ok(())
    }
}
