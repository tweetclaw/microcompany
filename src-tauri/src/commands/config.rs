use crate::config::AppConfig;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub requires_api_key: bool,
    pub default_base_url: Option<String>,
    pub default_models: Vec<String>,
}

#[tauri::command]
pub async fn get_config() -> Result<AppConfig, String> {
    AppConfig::load().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_config(config: AppConfig) -> Result<(), String> {
    config.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_available_providers() -> Result<Vec<ProviderInfo>, String> {
    Ok(vec![
        ProviderInfo {
            id: "anthropic".to_string(),
            name: "Anthropic Claude".to_string(),
            description: "Claude by Anthropic - Advanced reasoning and coding".to_string(),
            requires_api_key: true,
            default_base_url: Some("https://api.anthropic.com".to_string()),
            default_models: vec![
                "claude-opus-4-6".to_string(),
                "claude-sonnet-4-6".to_string(),
                "claude-haiku-4-5-20251001".to_string(),
            ],
        },
        ProviderInfo {
            id: "openai".to_string(),
            name: "OpenAI".to_string(),
            description: "GPT models by OpenAI".to_string(),
            requires_api_key: true,
            default_base_url: Some("https://api.openai.com".to_string()),
            default_models: vec![
                "gpt-4o".to_string(),
                "gpt-4-turbo".to_string(),
                "gpt-3.5-turbo".to_string(),
            ],
        },
        ProviderInfo {
            id: "ollama".to_string(),
            name: "Ollama".to_string(),
            description: "Run models locally with Ollama".to_string(),
            requires_api_key: false,
            default_base_url: Some("http://localhost:11434".to_string()),
            default_models: vec![
                "llama3".to_string(),
                "mistral".to_string(),
                "codellama".to_string(),
            ],
        },
        ProviderInfo {
            id: "deepseek".to_string(),
            name: "DeepSeek".to_string(),
            description: "DeepSeek AI models".to_string(),
            requires_api_key: true,
            default_base_url: Some("https://api.deepseek.com".to_string()),
            default_models: vec![
                "deepseek-chat".to_string(),
                "deepseek-coder".to_string(),
            ],
        },
        ProviderInfo {
            id: "groq".to_string(),
            name: "Groq".to_string(),
            description: "Fast inference with Groq".to_string(),
            requires_api_key: true,
            default_base_url: Some("https://api.groq.com/openai".to_string()),
            default_models: vec![
                "llama-3.1-70b-versatile".to_string(),
                "mixtral-8x7b-32768".to_string(),
            ],
        },
        ProviderInfo {
            id: "moonshot".to_string(),
            name: "Moonshot AI (Kimi)".to_string(),
            description: "月之暗面 Kimi 模型".to_string(),
            requires_api_key: true,
            default_base_url: Some("https://api.moonshot.cn".to_string()),
            default_models: vec![
                "moonshot-v1-8k".to_string(),
                "moonshot-v1-32k".to_string(),
                "moonshot-v1-128k".to_string(),
            ],
        },
        ProviderInfo {
            id: "zhipuai".to_string(),
            name: "智谱 AI (GLM)".to_string(),
            description: "智谱 AI GLM 模型".to_string(),
            requires_api_key: true,
            default_base_url: Some("https://open.bigmodel.cn".to_string()),
            default_models: vec![
                "glm-4".to_string(),
                "glm-4-plus".to_string(),
            ],
        },
    ])
}

#[tauri::command]
pub async fn validate_provider_config(
    provider_id: String,
    api_key: String,
    base_url: Option<String>,
) -> Result<bool, String> {
    log::info!("Validating provider config: {} with base_url: {:?}", provider_id, base_url);

    if provider_id != "ollama" && api_key.is_empty() {
        return Err("API key is required".to_string());
    }

    Ok(true)
}
