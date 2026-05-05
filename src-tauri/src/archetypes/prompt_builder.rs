pub const TASK_PROMPT_CONTRACT_VERSION: &str = "task-role-v6-structured-handoff";

#[derive(Debug, Clone)]
pub struct TeamRolePromptContext {
    pub name: String,
    pub identity: String,
    pub archetype_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RolePromptContext {
    pub roster: Vec<TeamRolePromptContext>,
    pub active_role_index: usize,
    pub recommended_handoff_roles: Vec<TeamRolePromptContext>,
}

pub fn build_role_system_prompt_v2(
    role_name: &str,
    role_identity: &str,
    role_definition_path: Option<&str>,
    role_context: Option<&RolePromptContext>,
    working_directory: Option<&str>,
) -> String {
    let mut prompt = String::new();

    // 1. 角色标题
    prompt.push_str(&format!("# 角色：{}\n\n", role_name));

    // 2. 读取角色定义文件的指令（如果提供了路径）
    if let Some(path) = role_definition_path {
        prompt.push_str("## 🔴 首要任务：读取角色定义\n\n");
        prompt.push_str(&format!("务必使用 Read 工具读取 **`{}`** 文件，理解自己的角色约束\n\n", path));
        prompt.push_str("***务必先读取再回答问题***\n");
        prompt.push_str("***务必全程记住自己的角色定位***\n\n");
    }

    // 3. 团队配置（如果有）
    if let Some(ctx) = role_context {
        prompt.push_str(&build_team_composition_v2(role_name, role_identity, ctx));
    }

    // 4. 工作目录
    if let Some(dir) = working_directory {
        prompt.push_str(&format!("\n## 工作目录\n{}\n", dir));
    }

    prompt
}

/// 生成团队配置信息（新版本，使用字母编号）
fn build_team_composition_v2(
    role_name: &str,
    _role_identity: &str,
    ctx: &RolePromptContext,
) -> String {
    let mut section = String::from("## 当前团队配置\n\n");

    // 团队成员列表（带字母编号）
    section.push_str("**团队成员：**\n");
    for (index, role) in ctx.roster.iter().enumerate() {
        let letter = (b'a' + index as u8) as char;
        if role.name == role_name {
            section.push_str(&format!("{}. {} - {} (你)\n", letter, role.name, role.identity));
        } else {
            section.push_str(&format!("{}. {} - {}\n", letter, role.name, role.identity));
        }
    }
    section.push_str("\n");

    // 交接规则（强制要求）
    section.push_str("## 🔴 输出格式要求\n\n");
    section.push_str("**务必在回答末尾添加交接标签（必需）：**\n\n");
    section.push_str("需要交接时：\n");
    section.push_str("```\n<handoff>成员编号</handoff>\n```\n\n");
    section.push_str("不需要交接时：\n");
    section.push_str("```\n<handoff></handoff>\n```\n\n");
    section.push_str("**注意：**\n");
    section.push_str("- 成员编号使用字母（a, b, c...），不是角色名称\n");
    section.push_str("- 必须在回答末尾添加此标签，不可省略\n\n");

    section
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_role_context() -> RolePromptContext {
        RolePromptContext {
            roster: vec![
                TeamRolePromptContext {
                    name: "Alice".to_string(),
                    identity: "Product Manager".to_string(),
                    archetype_id: Some("product_manager".to_string()),
                },
                TeamRolePromptContext {
                    name: "Bob".to_string(),
                    identity: "Developer".to_string(),
                    archetype_id: Some("backend_developer".to_string()),
                },
            ],
            active_role_index: 0,
            recommended_handoff_roles: vec![],
        }
    }

    #[test]
    fn test_get_role_definition_path() {
        let path = crate::archetypes::get_role_definition_path("product_manager");
        assert_eq!(path, "resources/role-definitions/product_manager.md");
    }

    #[test]
    fn test_build_role_system_prompt_v2_includes_read_instruction() {
        let prompt = build_role_system_prompt_v2(
            "Alice",
            "Product Manager",
            Some("resources/role-definitions/product_manager.md"),
            Some(&sample_role_context()),
            Some("/workspace"),
        );

        assert!(prompt.contains("# 角色：Alice"));
        assert!(prompt.contains("🔴 首要任务：读取角色定义"));
        assert!(prompt.contains("务必使用 Read 工具读取"));
        assert!(prompt.contains("resources/role-definitions/product_manager.md"));
        assert!(prompt.contains("务必先读取再回答问题"));
        assert!(prompt.contains("## 工作目录"));
        assert!(prompt.contains("/workspace"));
    }

    #[test]
    fn test_build_team_composition_v2_uses_letter_ids() {
        let ctx = sample_role_context();
        let composition = build_team_composition_v2("Alice", "Product Manager", &ctx);

        assert!(composition.contains("## 当前团队配置"));
        assert!(composition.contains("a. Alice - Product Manager (你)"));
        assert!(composition.contains("b. Bob - Developer"));
        assert!(composition.contains("<handoff>成员编号</handoff>"));
        assert!(composition.contains("使用成员编号（字母），不是角色名称"));
    }

    #[tokio::test]
    #[ignore]
    async fn test_ai_reads_role_definition_integration() {
        use std::fs;
        use serde_json::json;

        let config = match crate::config::AppConfig::load() {
            Ok(cfg) => cfg,
            Err(_) => {
                println!("跳过：无法加载配置");
                return;
            }
        };

        let provider = match config.providers.iter().find(|p| p.id == config.active_provider) {
            Some(p) => p,
            None => {
                println!("跳过：未找到 active provider");
                return;
            }
        };

        if provider.api_key.is_empty() {
            println!("跳过：未配置 API key");
            return;
        }

        let user_input = fs::read_to_string("../1.log").unwrap_or_default();

        // 生成系统提示词
        let system_prompt = build_role_system_prompt_v2(
            "TestRole",
            "Product Manager",
            Some("resources/role-definitions/product_manager.md"),
            Some(&sample_role_context()),
            Some("/test/workspace"),
        );

        println!("=== SYSTEM_PROMPT_START ===");
        println!("{}", system_prompt);
        println!("=== SYSTEM_PROMPT_END ===");

        let api_base = provider.base_url.as_deref().unwrap_or("https://api.anthropic.com");
        let url = format!("{}/v1/messages", api_base);
        let client = reqwest::Client::new();

        // 第一次调用：发送系统提示词作为用户消息
        let request_body_1 = json!({
            "model": provider.model,
            "max_tokens": 1024,
            "messages": [{"role": "user", "content": system_prompt}]
        });

        let response_1 = match client
            .post(&url)
            .header("x-api-key", &provider.api_key)
            .header("content-type", "application/json")
            .header("anthropic-version", "2023-06-01")
            .json(&request_body_1)
            .send()
            .await
        {
            Ok(resp) => resp,
            Err(e) => {
                println!("❌ 第一次 API 调用失败: {}", e);
                return;
            }
        };

        let response_json_1: serde_json::Value = match response_1.json().await {
            Ok(json) => json,
            Err(e) => {
                println!("❌ 第一次响应解析失败: {}", e);
                return;
            }
        };

        println!("📋 第一次响应 JSON: {}", serde_json::to_string_pretty(&response_json_1).unwrap_or_default());

        let ai_response_1 = response_json_1["content"]
            .as_array()
            .and_then(|arr| {
                arr.iter()
                    .find(|block| block["type"].as_str() == Some("text"))
                    .and_then(|block| block["text"].as_str())
            })
            .unwrap_or("无法提取响应");

        println!("=== AI_RESPONSE_1_START ===");
        println!("{}", ai_response_1);
        println!("=== AI_RESPONSE_1_END ===");

        // 第二次调用：发送实际任务（包含对话历史）
        let request_body_2 = json!({
            "model": provider.model,
            "max_tokens": 4096,
            "messages": [
                {"role": "user", "content": system_prompt},
                {"role": "assistant", "content": ai_response_1},
                {"role": "user", "content": user_input}
            ]
        });

        let response_2 = match client
            .post(&url)
            .header("x-api-key", &provider.api_key)
            .header("content-type", "application/json")
            .header("anthropic-version", "2023-06-01")
            .json(&request_body_2)
            .send()
            .await
        {
            Ok(resp) => resp,
            Err(e) => {
                println!("❌ 第二次 API 调用失败: {}", e);
                return;
            }
        };

        let response_json_2: serde_json::Value = match response_2.json().await {
            Ok(json) => json,
            Err(e) => {
                println!("❌ 第二次响应解析失败: {}", e);
                return;
            }
        };

        let ai_response_2 = response_json_2["content"]
            .as_array()
            .and_then(|arr| {
                arr.iter()
                    .find(|block| block["type"].as_str() == Some("text"))
                    .and_then(|block| block["text"].as_str())
            })
            .unwrap_or("无法提取响应");

        println!("=== AI_RESPONSE_2_START ===");
        println!("{}", ai_response_2);
        println!("=== AI_RESPONSE_2_END ===");

        println!("📝 系统提示词长度：{} 字符", system_prompt.len());
        println!("📝 AI 第一次响应长度：{} 字符", ai_response_1.len());
        println!("📝 AI 第二次响应长度：{} 字符", ai_response_2.len());
    }
}
