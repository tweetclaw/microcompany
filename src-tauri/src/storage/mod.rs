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

        // Load existing messages
        let mut messages = self.load_messages(working_dir)?;

        // Add new message
        messages.push(message);

        // Save to file
        let json = serde_json::to_string_pretty(&messages)?;
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
        let messages: Vec<StoredMessage> = serde_json::from_str(&content)?;

        Ok(messages)
    }

    /// Clear all messages for a working directory
    pub fn clear_messages(&self, working_dir: &Path) -> anyhow::Result<()> {
        let file_path = self.get_conversation_file(working_dir);

        if file_path.exists() {
            fs::remove_file(file_path)?;
        }

        Ok(())
    }
}
