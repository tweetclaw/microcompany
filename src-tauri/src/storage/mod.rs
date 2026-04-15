use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::fs;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredMessage {
    pub role: String,
    pub content: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    pub working_directory: String,
    pub messages: Vec<StoredMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub working_directory: String,
    pub message_count: usize,
    pub last_activity: i64,
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

    /// Generate a hash for the working directory path
    fn hash_path(path: &Path) -> String {
        let mut hasher = DefaultHasher::new();
        path.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }

    /// Get the conversation file path for a working directory
    fn get_conversation_file(&self, working_dir: &Path) -> PathBuf {
        let hash = Self::hash_path(working_dir);
        self.storage_dir.join(format!("{}.json", hash))
    }

    /// Save a message to the conversation history
    pub fn save_message(&self, working_dir: &Path, message: StoredMessage) -> anyhow::Result<()> {
        let file_path = self.get_conversation_file(working_dir);

        // Load existing session data, handling both old and new formats
        let mut session_data = if file_path.exists() {
            let content = fs::read_to_string(&file_path)?;
            // Try new format (SessionData struct) first
            if let Ok(data) = serde_json::from_str::<SessionData>(&content) {
                data
            } else if let Ok(messages) = serde_json::from_str::<Vec<StoredMessage>>(&content) {
                // Fallback to old format (plain array of messages)
                SessionData {
                    working_directory: working_dir.to_string_lossy().to_string(),
                    messages,
                }
            } else {
                // If both formats fail, start fresh
                log::warn!("Failed to parse conversation file, starting fresh: {:?}", file_path);
                SessionData {
                    working_directory: working_dir.to_string_lossy().to_string(),
                    messages: Vec::new(),
                }
            }
        } else {
            SessionData {
                working_directory: working_dir.to_string_lossy().to_string(),
                messages: Vec::new(),
            }
        };

        // Add new message
        session_data.messages.push(message);

        // Save to file
        let json = serde_json::to_string_pretty(&session_data)?;
        fs::write(file_path, json)?;

        Ok(())
    }

    /// Load all messages for a working directory
    pub fn load_messages(&self, working_dir: &Path) -> anyhow::Result<Vec<StoredMessage>> {
        let file_path = self.get_conversation_file(working_dir);

        if !file_path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(file_path)?;

        // Try to parse as SessionData first (new format)
        if let Ok(session_data) = serde_json::from_str::<SessionData>(&content) {
            return Ok(session_data.messages);
        }

        // Fallback to old format (just array of messages)
        let messages: Vec<StoredMessage> = serde_json::from_str(&content)?;
        Ok(messages)
    }

    /// Clear all messages for a working directory
    pub fn clear_messages(&self, working_dir: &Path) -> anyhow::Result<()> {
        let file_path = self.get_conversation_file(working_dir);

        if file_path.exists() {
            // Create empty session data to preserve the working directory
            let session_data = SessionData {
                working_directory: working_dir.to_string_lossy().to_string(),
                messages: Vec::new(),
            };

            let json = serde_json::to_string_pretty(&session_data)?;
            fs::write(file_path, json)?;
        }

        Ok(())
    }

    /// List all sessions with their metadata
    pub fn list_all_sessions(&self) -> anyhow::Result<Vec<SessionInfo>> {
        let mut sessions = Vec::new();

        if !self.storage_dir.exists() {
            return Ok(sessions);
        }

        for entry in fs::read_dir(&self.storage_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                // Read the file to get session data
                let content = fs::read_to_string(&path)?;

                // Only parse new format (SessionData with working_directory)
                if let Ok(session_data) = serde_json::from_str::<SessionData>(&content) {
                    if session_data.messages.is_empty() {
                        continue;
                    }

                    let last_activity = session_data.messages.last().map(|m| m.timestamp).unwrap_or(0);
                    let message_count = session_data.messages.len();

                    sessions.push(SessionInfo {
                        working_directory: session_data.working_directory,
                        message_count,
                        last_activity,
                    });
                }
                // Skip old format files - they don't have working_directory info
            }
        }

        // Sort by last activity (most recent first)
        sessions.sort_by(|a, b| b.last_activity.cmp(&a.last_activity));

        Ok(sessions)
    }

    /// Delete a session by working directory
    pub fn delete_session(&self, working_dir: &Path) -> anyhow::Result<()> {
        let file_path = self.get_conversation_file(working_dir);
        if file_path.exists() {
            fs::remove_file(file_path)?;
        }
        Ok(())
    }
}
