use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub api_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    pub model: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub active_provider: String,
    pub providers: Vec<ProviderConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brave_search_api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            active_provider: "anthropic".to_string(),
            providers: vec![
                ProviderConfig {
                    id: "anthropic".to_string(),
                    name: "Anthropic Claude".to_string(),
                    api_key: String::new(),
                    base_url: Some("https://api.anthropic.com".to_string()),
                    model: "claude-opus-4-6".to_string(),
                    enabled: true,
                },
            ],
            brave_search_api_key: None,
            theme: None,
        }
    }
}

impl AppConfig {
    fn config_path() -> Result<PathBuf> {
        let home = dirs::home_dir()
            .ok_or_else(|| anyhow::anyhow!("Failed to get home directory"))?;
        let config_dir = home.join(".microcompany");

        // 确保配置目录存在
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir)?;
        }

        Ok(config_dir.join("config.json"))
    }

    pub fn load() -> Result<Self> {
        let config_path = Self::config_path()?;

        if !config_path.exists() {
            // 如果配置文件不存在,返回默认配置
            return Ok(Self::default());
        }

        let content = fs::read_to_string(&config_path)?;

        // 尝试解析新格式
        match serde_json::from_str::<AppConfig>(&content) {
            Ok(config) => Ok(config),
            Err(_) => {
                // 尝试解析旧格式并迁移
                #[derive(Deserialize)]
                struct LegacyConfig {
                    anthropic_api_key: String,
                    model: String,
                    base_url: String,
                }

                if let Ok(legacy) = serde_json::from_str::<LegacyConfig>(&content) {
                    let new_config = AppConfig {
                        active_provider: "anthropic".to_string(),
                        providers: vec![
                            ProviderConfig {
                                id: "anthropic".to_string(),
                                name: "Anthropic Claude".to_string(),
                                api_key: legacy.anthropic_api_key,
                                base_url: Some(legacy.base_url),
                                model: legacy.model,
                                enabled: true,
                            },
                        ],
                        brave_search_api_key: None,
                        theme: None,
                    };

                    // 保存迁移后的配置
                    new_config.save()?;

                    Ok(new_config)
                } else {
                    // 如果都解析失败,返回默认配置
                    Ok(Self::default())
                }
            }
        }
    }

    pub fn save(&self) -> Result<()> {
        let config_path = Self::config_path()?;
        let content = serde_json::to_string_pretty(self)?;
        fs::write(&config_path, content)?;

        Ok(())
    }
}
