use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiConfig {
    pub anthropic_api_key: Option<String>,
    pub model: String,
    pub base_url: Option<String>,
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            anthropic_api_key: None,
            model: "claude-sonnet-4-6".to_string(),
            base_url: None,
        }
    }
}

impl ApiConfig {
    pub fn load() -> Result<Self, String> {
        // Try to load from environment variable first
        if let Ok(api_key) = env::var("ANTHROPIC_API_KEY") {
            return Ok(Self {
                anthropic_api_key: Some(api_key),
                model: env::var("ANTHROPIC_MODEL")
                    .unwrap_or_else(|_| "claude-sonnet-4-6".to_string()),
                base_url: env::var("ANTHROPIC_BASE_URL").ok(),
            });
        }

        // Try to load from config file
        let config_path = Self::config_path()?;
        if config_path.exists() {
            let content = fs::read_to_string(&config_path)
                .map_err(|e| format!("Failed to read config file: {}", e))?;
            let config: ApiConfig = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse config file: {}", e))?;
            return Ok(config);
        }

        // Return default config
        Ok(Self::default())
    }

    fn config_path() -> Result<PathBuf, String> {
        let home = env::var("HOME")
            .map_err(|_| "HOME environment variable not set".to_string())?;
        Ok(PathBuf::from(home).join(".microcompany").join("config.json"))
    }


}
