use serde::{Deserialize, Serialize};
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffInfo {
    pub has_handoff: bool,
    pub task_summary: String,
    pub key_requirements: Vec<String>,
    pub suggested_role: String,
}

const HANDOFF_EXTRACTION_PROMPT: &str = r#"你是一个 AI 团队协作助手。分析当前对话的最后一条消息,判断是否包含任务交接意图。

任务:
1. 判断是否需要交接给其他角色 (has_handoff: true/false)
2. 如果需要交接,提取任务摘要 (task_summary)
3. 提取关键需求列表 (key_requirements)
4. 推荐最合适的接手角色 (suggested_role)

角色职责参考:
- 产品经理: 需求分析、功能规划
- 开发工程师: 代码实现、技术方案
- 测试工程师: 测试用例、质量保证
- 设计师: UI/UX 设计、视觉规范

返回 JSON 格式:
{
  "has_handoff": boolean,
  "task_summary": string,
  "key_requirements": string[],
  "suggested_role": string
}

注意:
- task_summary 应简洁明了,一句话概括任务
- key_requirements 提取核心要点,不超过 5 条
- suggested_role 必须是上述角色之一
- 如果没有明确的交接意图,返回 has_handoff: false
"#;

pub async fn extract_handoff_info(
    role_name: &str,
    last_message: &str,
    api_key: &str,
    model: &str,
    base_url: Option<&str>,
) -> Result<HandoffInfo> {
    use claurst_api::{AnthropicClient, client::ClientConfig, CreateMessageRequest, ApiMessage, SystemPrompt};
    use serde_json::json;

    log::info!("🔍 [Handoff Observer] 开始提取交接信息");
    log::info!("🔍 [Handoff Observer] 角色: {}", role_name);
    log::info!("🔍 [Handoff Observer] 消息长度: {} 字符", last_message.len());
    log::info!("🔍 [Handoff Observer] 使用模型: {}", model);

    // 创建 API 客户端
    let api_base = base_url.unwrap_or("https://api.anthropic.com");
    log::info!("🔍 [Handoff Observer] API Base: {}", api_base);

    let client_config = ClientConfig {
        api_key: api_key.to_string(),
        api_base: api_base.to_string(),
        ..Default::default()
    };
    let client = AnthropicClient::new(client_config)?;
    log::info!("🔍 [Handoff Observer] API 客户端创建成功");

    // 构建用户消息
    let user_content = format!("角色: {}\n最后一条消息: {}", role_name, last_message);
    let user_message = ApiMessage {
        role: "user".to_string(),
        content: json!(user_content),
    };

    // 构建请求
    let request = CreateMessageRequest::builder(model, 2048)
        .system(SystemPrompt::Text(HANDOFF_EXTRACTION_PROMPT.to_string()))
        .add_message(user_message)
        .build();

    log::info!("🔍 [Handoff Observer] 准备调用 API 提取交接信息...");

    // 调用 API
    let response = client.create_message(request).await?;

    log::info!("🔍 [Handoff Observer] API 调用成功，收到响应");
    log::info!("🔍 [Handoff Observer] 响应内容块数量: {}", response.content.len());

    // 提取响应文本
    let response_text = response
        .content
        .iter()
        .filter_map(|value| {
            if let Some(text) = value.get("text").and_then(|t| t.as_str()) {
                Some(text)
            } else {
                None
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    log::info!("🔍 [Handoff Observer] 提取的响应文本长度: {} 字符", response_text.len());
    log::debug!("🔍 [Handoff Observer] 响应文本内容: {}", response_text);

    // 尝试解析 JSON
    // 首先尝试直接解析
    log::info!("🔍 [Handoff Observer] 尝试直接解析 JSON...");
    if let Ok(info) = serde_json::from_str::<HandoffInfo>(&response_text) {
        log::info!("✅ [Handoff Observer] JSON 解析成功！");
        log::info!("✅ [Handoff Observer] has_handoff: {}", info.has_handoff);
        log::info!("✅ [Handoff Observer] task_summary: {}", info.task_summary);
        log::info!("✅ [Handoff Observer] suggested_role: {}", info.suggested_role);
        log::info!("✅ [Handoff Observer] key_requirements 数量: {}", info.key_requirements.len());
        return Ok(info);
    }

    // 如果失败，尝试提取 JSON 部分（可能包含在 markdown 代码块中）
    log::warn!("⚠️ [Handoff Observer] 直接解析失败，尝试提取 JSON 部分...");
    if let Some(json_start) = response_text.find('{') {
        if let Some(json_end) = response_text.rfind('}') {
            let json_str = &response_text[json_start..=json_end];
            log::info!("🔍 [Handoff Observer] 提取的 JSON 字符串长度: {} 字符", json_str.len());
            if let Ok(info) = serde_json::from_str::<HandoffInfo>(json_str) {
                log::info!("✅ [Handoff Observer] JSON 提取解析成功！");
                log::info!("✅ [Handoff Observer] has_handoff: {}", info.has_handoff);
                log::info!("✅ [Handoff Observer] task_summary: {}", info.task_summary);
                log::info!("✅ [Handoff Observer] suggested_role: {}", info.suggested_role);
                return Ok(info);
            }
        }
    }

    // 如果都失败，返回默认值（无 handoff）
    log::error!("❌ [Handoff Observer] JSON 解析完全失败，返回默认值（无交接）");
    Ok(HandoffInfo {
        has_handoff: false,
        task_summary: String::new(),
        key_requirements: Vec::new(),
        suggested_role: String::new(),
    })
}
