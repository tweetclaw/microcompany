use serde::{Deserialize, Serialize};
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffInfo {
    pub has_handoff: bool,
    pub suggested_role: Option<String>,
    pub full_message: String,
}

// ========== 以下为智能路由系统（已暂停使用）==========
// 保留以便将来恢复

/*
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffInfoOld {
    pub has_handoff: bool,
    pub task_summary: String,
    pub key_requirements: Vec<String>,
    pub suggested_role: String,
}
*/

// 内部使用的结构，AI 返回的是 role_id（智能路由系统使用）
/*
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
struct HandoffInfoRaw {
    has_handoff: bool,
    task_summary: String,
    key_requirements: Vec<String>,
    suggested_role_id: String,
}

pub async fn extract_handoff_info(
    role_name: &str,
    last_message: &str,
    available_roles: Vec<String>,
    api_key: &str,
    model: &str,
    base_url: Option<&str>,
) -> Result<HandoffInfo> {
    use serde_json::json;
    use std::collections::HashMap;

    log::info!("🔍 [Handoff Observer] 开始提取交接信息");
    log::info!("🔍 [Handoff Observer] 角色: {}", role_name);
    log::info!("🔍 [Handoff Observer] 消息长度: {} 字符", last_message.len());
    log::info!("🔍 [Handoff Observer] 使用模型: {}", model);

    let api_base = base_url.unwrap_or("https://api.anthropic.com");
    log::info!("🔍 [Handoff Observer] API Base: {}", api_base);

    // 构建角色映射表：role_id -> role_name
    let mut role_mapping: HashMap<String, String> = HashMap::new();
    let mut id_to_name: HashMap<String, String> = HashMap::new();

    for (index, role) in available_roles.iter().enumerate() {
        let role_id = format!("role_{}", (b'a' + index as u8) as char);
        role_mapping.insert(role_id.clone(), role.clone());
        id_to_name.insert(role_id, role.clone());
    }

    log::info!("🔍 [Handoff Observer] 角色映射表: {:?}", role_mapping);

    let system_prompt = r#"你是一个智能 AI 路由系统。你的职责是：根据当前 AI 的部分回答内容，判断下一个接手工作的人员编号。

当前团队组合和编号会在用户输入中提供。
当前回答问题的 AI 也会在用户输入中说明。

你需要判断：
1. 是否需要交接给其他 AI（has_handoff: true/false）
2. 如果需要交接，推荐哪个人员编号接手（suggested_role_id）
3. 任务摘要（task_summary）
4. 关键需求（key_requirements）

返回格式（必须严格遵守）：
{
  "has_handoff": boolean,
  "task_summary": string,
  "key_requirements": string[],
  "suggested_role_id": string
}

重要规则：
- 返回结果必须是纯 JSON 格式
- 不要使用 markdown 代码块
- 不要使用 ```json 或 ``` 标记
- 直接返回 JSON，不要任何格式化标记
- suggested_role_id 必须使用人员编号（如 role_a, role_b），不能使用角色名称
- 不能推荐当前 AI 自己的编号
- 无论你有什么困惑或想法，返回结果必须是 JSON 结构
- 不要添加任何解释或说明文字
- 返回前检查：结果是否为有效 JSON"#.to_string();

    log::info!("🔍 [Handoff Observer] 系统提示词已生成，包含 {} 个角色", role_mapping.len());

    // 智能提取消息内容：handoff 意图通常在消息末尾，优先提取最后部分
    let message_to_analyze = if last_message.len() > 1500 {
        // 提取最后 1500 字符（足够包含完整的 handoff 推荐）
        let target_start = last_message.len().saturating_sub(1500);
        let start = last_message.char_indices()
            .find(|(i, _)| *i >= target_start)
            .map(|(i, _)| i)
            .unwrap_or(0);
        format!("...(前文省略)\n{}", &last_message[start..])
    } else {
        last_message.to_string()
    };

    // 构建用户消息 - 包含团队组合、当前AI、内容分隔符
    let team_list = role_mapping
        .iter()
        .map(|(id, name)| format!("- {}: {}", id, name))
        .collect::<Vec<_>>()
        .join("\n");

    let user_content = format!(
        r#"当前团队组合：
{}

当前 AI：{}

你的回答务必是 JSON 结构。

{} 的部分回答内容如下：
------内容开始------
{}
------内容结束------"#,
        team_list, role_name, role_name, message_to_analyze
    );
    // 检测是否使用 DeepSeek API
    let is_deepseek = api_base.contains("deepseek");
    log::info!("🔍 [Handoff Observer] DeepSeek 检测结果: {}", is_deepseek);
    log::info!("🔍 [Handoff Observer] API Base URL: {}", api_base);

    // 根据 API 类型构建不同格式的请求体
    let mut request_body = if is_deepseek {
        // OpenAI/DeepSeek 格式：system 作为 messages 的第一条
        json!({
            "model": model,
            "max_tokens": 2048,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": user_content
                }
            ],
            "response_format": {"type": "json_object"}
        })
    } else {
        // Anthropic 格式：system 是单独字段
        json!({
            "model": model,
            "max_tokens": 2048,
            "system": system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": user_content
                }
            ]
        })
    };

    // Anthropic: 使用 prefill 技术
    if !is_deepseek {
        if let Some(messages) = request_body["messages"].as_array_mut() {
            messages.push(json!({
                "role": "assistant",
                "content": "{"
            }));
        }
        log::info!("🔍 [Handoff Observer] 使用 Anthropic prefill 模式");
    } else {
        log::info!("🔍 [Handoff Observer] 使用 DeepSeek JSON 模式");
    }

    log::info!("🔍 [Handoff Observer] 准备调用 API 提取交接信息...");
    log::info!("🔍 [Handoff Observer] 系统提示词长度: {} 字符", system_prompt.len());
    log::info!("🔍 [Handoff Observer] 系统提示词前200字符: {}", system_prompt.chars().take(200).collect::<String>());
    log::info!("🔍 [Handoff Observer] 用户消息长度: {} 字符", user_content.len());
    log::info!("🔍 [Handoff Observer] 用户消息前200字符: {}", user_content.chars().take(200).collect::<String>());

    // 使用 reqwest 直接调用 API
    let client = reqwest::Client::new();

    // 根据 API 类型使用不同的端点和请求头
    let (endpoint, auth_header_name, auth_header_value) = if is_deepseek {
        (
            format!("{}/v1/chat/completions", api_base),
            "Authorization",
            format!("Bearer {}", api_key),
        )
    } else {
        (
            format!("{}/v1/messages", api_base),
            "x-api-key",
            api_key.to_string(),
        )
    };

    log::info!("🔍 [Handoff Observer] API 端点: {}", endpoint);

    let mut request_builder = client
        .post(&endpoint)
        .header(auth_header_name, auth_header_value)
        .header("content-type", "application/json");

    // Anthropic 需要额外的 version header
    if !is_deepseek {
        request_builder = request_builder.header("anthropic-version", "2023-06-01");
    }

    let response = request_builder
        .json(&request_body)
        .send()
        .await?;

    log::info!("🔍 [Handoff Observer] API 调用成功，收到响应");

    let response_json: serde_json::Value = response.json().await?;
    log::info!("🔍 [Handoff Observer] 响应 JSON 解析成功");
    log::info!("🔍 [Handoff Observer] 完整响应 JSON: {}", serde_json::to_string_pretty(&response_json).unwrap_or_else(|_| "无法序列化".to_string()));

    // 根据 API 类型提取响应文本
    let response_text = if is_deepseek {
        // OpenAI/DeepSeek 格式: choices[0].message.content
        response_json["choices"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|choice| choice["message"]["content"].as_str())
            .unwrap_or("")
    } else {
        // Anthropic 格式: content[].text
        response_json["content"]
            .as_array()
            .and_then(|arr| {
                arr.iter()
                    .find(|block| block["type"].as_str() == Some("text"))
                    .and_then(|block| block["text"].as_str())
            })
            .unwrap_or("")
    };

    log::info!("🔍 [Handoff Observer] 提取的响应文本长度: {} 字符", response_text.len());
    log::info!("🔍 [Handoff Observer] 响应文本前500字符: {}",
        response_text.chars().take(500).collect::<String>());

    // 尝试解析 JSON
    // DeepSeek: 响应已经是完整 JSON
    // Anthropic: 使用了 prefill "{"，需要手动添加开头的大括号
    let json_text = if is_deepseek {
        log::info!("🔍 [Handoff Observer] DeepSeek 模式：响应已是完整 JSON，直接使用");
        response_text.to_string()
    } else {
        log::info!("🔍 [Handoff Observer] Anthropic 模式：添加前缀大括号补全 JSON");
        format!("{{{}", response_text)
    };

    log::info!("🔍 [Handoff Observer] 尝试直接解析 JSON...");
    log::info!("🔍 [Handoff Observer] JSON 文本长度: {} 字符", json_text.len());
    log::info!("🔍 [Handoff Observer] JSON 文本前200字符: {}", json_text.chars().take(200).collect::<String>());

    match serde_json::from_str::<HandoffInfoRaw>(&json_text) {
        Ok(raw) => {
            log::info!("✅ [Handoff Observer] JSON 解析成功！");
            log::info!("✅ [Handoff Observer] has_handoff: {}", raw.has_handoff);
            log::info!("✅ [Handoff Observer] task_summary: {}", raw.task_summary);
            log::info!("✅ [Handoff Observer] suggested_role_id: {}", raw.suggested_role_id);

            // 解码 role_id 到实际角色名
            let suggested_role = id_to_name
                .get(&raw.suggested_role_id)
                .cloned()
                .unwrap_or_else(|| {
                    log::warn!("⚠️ [Handoff Observer] 未知的 role_id: {}", raw.suggested_role_id);
                    raw.suggested_role_id.clone()
                });

            log::info!("✅ [Handoff Observer] 解码后的角色: {}", suggested_role);

            return Ok(HandoffInfo {
                has_handoff: raw.has_handoff,
                task_summary: raw.task_summary,
                key_requirements: raw.key_requirements,
                suggested_role,
            });
        }
        Err(e) => {
            log::warn!("⚠️ [Handoff Observer] 直接解析失败: {}", e);
        }
    }

    // 如果失败，尝试提取 JSON 部分（可能包含在 markdown 代码块中）
    log::warn!("⚠️ [Handoff Observer] 直接解析失败，尝试提取 JSON 部分...");

    // 策略1: 去除 markdown 代码块标记
    let cleaned_text = response_text
        .replace("```json", "")
        .replace("```", "")
        .trim()
        .to_string();

    // 策略2: 使用正则提取完整 JSON 对象
    if let Some(json_start) = cleaned_text.find('{') {
        if let Some(json_end) = cleaned_text.rfind('}') {
            let json_str = &cleaned_text[json_start..=json_end];
            log::info!("🔍 [Handoff Observer] 提取的 JSON 字符串长度: {} 字符", json_str.len());

            // 分段输出 JSON 内容以避免日志截断
            let json_preview = if json_str.chars().count() > 200 {
                format!("{}...", json_str.chars().take(200).collect::<String>())
            } else {
                json_str.to_string()
            };
            log::info!("🔍 [Handoff Observer] 提取的 JSON 内容预览: {}", json_preview);

            match serde_json::from_str::<HandoffInfoRaw>(json_str) {
                Ok(raw) => {
                    log::info!("✅ [Handoff Observer] JSON 提取解析成功！");
                    log::info!("✅ [Handoff Observer] has_handoff: {}", raw.has_handoff);
                    log::info!("✅ [Handoff Observer] task_summary: {}", raw.task_summary);
                    log::info!("✅ [Handoff Observer] suggested_role_id: {}", raw.suggested_role_id);

                    // 解码 role_id 到实际角色名
                    let suggested_role = id_to_name
                        .get(&raw.suggested_role_id)
                        .cloned()
                        .unwrap_or_else(|| {
                            log::warn!("⚠️ [Handoff Observer] 未知的 role_id: {}", raw.suggested_role_id);
                            raw.suggested_role_id.clone()
                        });

                    log::info!("✅ [Handoff Observer] 解码后的角色: {}", suggested_role);

                    return Ok(HandoffInfo {
                        has_handoff: raw.has_handoff,
                        task_summary: raw.task_summary,
                        key_requirements: raw.key_requirements,
                        suggested_role,
                    });
                }
                Err(e) => {
                    log::error!("❌ [Handoff Observer] 提取的 JSON 解析失败: {}", e);
                    log::error!("❌ [Handoff Observer] 失败的 JSON 字符串: {}", json_str);
                }
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
*/

// ========== 智能路由系统结束 ==========

// ========== [HANDOFF] 块解析（当前使用）==========

/// 从文本中解析 [HANDOFF]...[/HANDOFF] 块，提取 target_role 和 recommended 字段。
/// 返回：Some(role_name) 表示有推荐交接对象，None 表示无需交接或无法解析。
fn parse_handoff_block(text: &str) -> Option<String> {
    let start_tag = "[HANDOFF]";
    let end_tag = "[/HANDOFF]";

    // 取最后一个 [HANDOFF] 块（与 claurst/mod.rs 保持一致，用 rfind）
    let start = text.rfind(start_tag)?;
    let content_start = start + start_tag.len();
    let end = text[content_start..].find(end_tag)? + content_start;
    let block = &text[content_start..end];

    let mut recommended = false;
    let mut target_role: Option<String> = None;

    for line in block.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once(':') {
            let key = key.trim().to_lowercase();
            let value = value.trim();
            match key.as_str() {
                "recommended" => {
                    recommended = matches!(value.to_lowercase().as_str(), "yes" | "true" | "是");
                }
                "target_role" => {
                    if !value.is_empty() {
                        target_role = Some(value.to_string());
                    }
                }
                _ => {}
            }
        }
    }

    if recommended {
        if let Some(role) = target_role {
            log::info!("🔍 [Handoff Parser] 解析到交接目标: {}", role);
            return Some(role);
        }
        log::info!("🔍 [Handoff Parser] recommended=yes 但 target_role 为空");
    } else {
        log::info!("🔍 [Handoff Parser] recommended=no，无需交接");
    }

    None
}

/// [HANDOFF] 块解析（当前使用的 fallback 路径）
pub fn extract_handoff_from_tag(
    last_message: &str,
) -> Result<HandoffInfo> {
    log::info!("🔍 [Handoff Parser] 开始解析 [HANDOFF] 块");
    log::info!("🔍 [Handoff Parser] 消息长度: {} 字符", last_message.len());

    let suggested_role = parse_handoff_block(last_message);

    let result = HandoffInfo {
        has_handoff: suggested_role.is_some(),
        suggested_role: suggested_role.clone(),
        full_message: last_message.to_string(),
    };

    log::info!("✅ [Handoff Parser] 解析完成");
    log::info!("✅ [Handoff Parser] has_handoff: {}", result.has_handoff);
    if let Some(ref role) = result.suggested_role {
        log::info!("✅ [Handoff Parser] suggested_role: {}", role);
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_handoff_block_with_target() {
        let text = "这是回答内容。\n[HANDOFF]\nrecommended: yes\ntarget_role: Developer\nreason: 需要开发\ndraft_message: 请开始实现。\n[/HANDOFF]";
        assert_eq!(parse_handoff_block(text), Some("Developer".to_string()));
    }

    #[test]
    fn test_parse_handoff_block_not_recommended() {
        let text = "这是回答。\n[HANDOFF]\nrecommended: no\ntarget_role:\nreason: 暂不交接\ndraft_message: 无需发送。\n[/HANDOFF]";
        assert_eq!(parse_handoff_block(text), None);
    }

    #[test]
    fn test_parse_handoff_block_no_block() {
        let text = "这是一些文本，没有 HANDOFF 块";
        assert_eq!(parse_handoff_block(text), None);
    }

    #[test]
    fn test_parse_handoff_block_empty_target() {
        let text = "[HANDOFF]\nrecommended: yes\ntarget_role:\nreason: 需要\ndraft_message: 请处理。\n[/HANDOFF]";
        // target_role 为空，即使 recommended=yes 也返回 None
        assert_eq!(parse_handoff_block(text), None);
    }

    #[test]
    fn test_parse_handoff_block_uses_last_block() {
        // 有多个块时，取最后一个
        let text = "[HANDOFF]\nrecommended: yes\ntarget_role: Alice\nreason: 第一次\ndraft_message: msg1\n[/HANDOFF]\n\n后续内容\n[HANDOFF]\nrecommended: yes\ntarget_role: Bob\nreason: 第二次\ndraft_message: msg2\n[/HANDOFF]";
        assert_eq!(parse_handoff_block(text), Some("Bob".to_string()));
    }

    #[test]
    fn test_parse_handoff_block_chinese_recommended() {
        let text = "[HANDOFF]\nrecommended: 是\ntarget_role: 产品经理\nreason: 需要确认需求\ndraft_message: 请确认。\n[/HANDOFF]";
        assert_eq!(parse_handoff_block(text), Some("产品经理".to_string()));
    }
}
