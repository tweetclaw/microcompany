use serde::{Deserialize, Serialize};
use tauri::State;
use crate::commands::session::AppState;
use crate::commands::config::ApiConfig;
use crate::commands::api_client::AnthropicClient;

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub async fn send_message(
    message: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Check session state and release lock immediately
    let is_initialized = {
        let session = state.session.lock().map_err(|e| e.to_string())?;
        session.is_initialized
    };

    if !is_initialized {
        return Err("Session not initialized. Please select a working directory first.".to_string());
    }

    // Load API configuration
    let config = ApiConfig::load().map_err(|e| format!("Failed to load config: {}", e))?;

    // Check if API key is configured
    if !config.has_api_key() {
        return Ok(format!(
            "⚠️ **API Key Not Configured**\n\n\
            To use real AI responses, you need to configure your Anthropic API key.\n\n\
            **Option 1: Environment Variable**\n\
            ```bash\n\
            export ANTHROPIC_API_KEY='your-api-key-here'\n\
            ```\n\n\
            **Option 2: Config File**\n\
            Create `~/.microcompany/config.json`:\n\
            ```json\n\
            {{\n\
              \"anthropic_api_key\": \"your-api-key-here\",\n\
              \"model\": \"claude-sonnet-4-6\"\n\
            }}\n\
            ```\n\n\
            Get your API key at: https://console.anthropic.com/\n\n\
            ---\n\n\
            **Your message:** {}\n\n\
            *(This is a mock response. Configure your API key to get real AI responses.)*",
            message
        ));
    }

    // Create API client and send message
    let api_key = config.anthropic_api_key.unwrap();
    let client = AnthropicClient::new(api_key, config.model);

    match client.send_message(&message).await {
        Ok(response) => Ok(response),
        Err(e) => Err(format!("Failed to get AI response: {}", e)),
    }
}
