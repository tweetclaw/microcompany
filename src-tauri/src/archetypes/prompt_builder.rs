pub const TASK_PROMPT_CONTRACT_VERSION: &str = "task-role-v7-stable-handoff";

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

    // 添加明确的开头说明
    prompt.push_str("# 📋 角色配置和工作指南\n\n");
    prompt.push_str("> 以下是你的角色定义和团队协作规则，请严格遵守。\n\n");

    // 1. 角色标题
    prompt.push_str(&format!("## 你的角色：{}\n\n", role_name));

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

    // 添加明确的结束标记
    prompt.push_str("\n---\n\n");
    prompt.push_str("# 💬 用户消息\n\n");

    prompt
}

/// 生成团队配置信息（v7，使用稳定的 role_name 和结构化 [HANDOFF] 块）
fn build_team_composition_v2(
    role_name: &str,
    _role_identity: &str,
    ctx: &RolePromptContext,
) -> String {
    let mut section = String::from("## 当前团队配置\n\n");

    // 团队成员列表（使用稳定的角色名称，不依赖顺序编号）
    section.push_str("**团队成员：**\n");
    for role in ctx.roster.iter() {
        if role.name == role_name {
            section.push_str(&format!("- {} - {} （你）\n", role.name, role.identity));
        } else {
            section.push_str(&format!("- {} - {}\n", role.name, role.identity));
        }
    }
    section.push_str("\n");

    // 交接规则（强制要求）
    section.push_str("## 🔴 输出格式要求（必须遵守）\n\n");
    section.push_str("**每次回答都必须以结构化 [HANDOFF] 块结尾，这是强制要求，不可省略！**\n\n");

    section.push_str("### 关键规则\n");
    section.push_str("- ✅ **必须生成文本响应**：即使调用了工具，也必须用文字总结结果或说明下一步\n");
    section.push_str("- ✅ **不能只调用工具就结束**：工具调用后必须生成文本来解释或展示结果\n");
    section.push_str("- ✅ **每次回答末尾必须附上完整的 [HANDOFF] 块**\n\n");

    section.push_str("### [HANDOFF] 块格式\n\n");
    section.push_str("**需要交接给其他成员时：**\n");
    section.push_str("```\n");
    section.push_str("[HANDOFF]\n");
    section.push_str("recommended: yes\n");
    section.push_str("target_role: 角色名称\n");
    section.push_str("reason: 交接原因（一句话）\n");
    section.push_str("draft_message: 给下一位成员的任务说明\n");
    section.push_str("[/HANDOFF]\n");
    section.push_str("```\n\n");

    // 用实际成员名举例（取第一个非自己的成员）
    let example_target = ctx.roster.iter()
        .find(|r| r.name != role_name)
        .map(|r| r.name.as_str())
        .unwrap_or("其他成员名");
    section.push_str(&format!("示例（交接给 {}）：\n", example_target));
    section.push_str("```\n");
    section.push_str("[HANDOFF]\n");
    section.push_str("recommended: yes\n");
    section.push_str(&format!("target_role: {}\n", example_target));
    section.push_str("reason: 需要该成员继续处理后续工作\n");
    section.push_str("draft_message: 请继续推进，已完成 X，下一步需要 Y。\n");
    section.push_str("[/HANDOFF]\n");
    section.push_str("```\n\n");

    section.push_str("**不需要交接时（工作未完成或需要用户继续输入）：**\n");
    section.push_str("```\n");
    section.push_str("[HANDOFF]\n");
    section.push_str("recommended: no\n");
    section.push_str("target_role:\n");
    section.push_str("reason: 当前阶段暂不交接\n");
    section.push_str("draft_message: 当前无需发送交接消息，因为此阶段仍由我继续推进。\n");
    section.push_str("[/HANDOFF]\n");
    section.push_str("```\n\n");

    section.push_str("### 格式规则\n");
    section.push_str("- ✅ `target_role` 使用团队成员列表中的**角色名称**（完全一致）\n");
    section.push_str("- ✅ [HANDOFF] 块必须在回答的最后\n");
    section.push_str("- ✅ 四个字段（recommended / target_role / reason / draft_message）必须全部填写\n");
    section.push_str("- ❌ 不可以省略文本响应\n");
    section.push_str("- ❌ 不可以省略 [HANDOFF] 块\n");
    section.push_str("- ❌ `target_role` 不可以使用不存在于团队列表中的名称\n\n");

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
        // 路径以 role-definitions/product_manager.md 结尾（实际根目录因环境而异）
        assert!(path.ends_with("role-definitions/product_manager.md"), "got: {}", path);
    }

    #[test]
    fn test_get_role_definition_path_maps_software_engineer() {
        let path = crate::archetypes::get_role_definition_path("software_engineer");
        // software_engineer 映射到 backend_developer.md
        assert!(path.ends_with("role-definitions/backend_developer.md"), "got: {}", path);
    }

    #[test]
    fn test_build_role_system_prompt_v2_includes_read_instruction() {
        let prompt = build_role_system_prompt_v2(
            "Alice",
            "Product Manager",
            Some("src-tauri/resources/role-definitions/product_manager.md"),
            Some(&sample_role_context()),
            Some("/workspace"),
        );

        assert!(prompt.contains("## 你的角色：Alice"));
        assert!(prompt.contains("🔴 首要任务：读取角色定义"));
        assert!(prompt.contains("务必使用 Read 工具读取"));
        assert!(prompt.contains("src-tauri/resources/role-definitions/product_manager.md"));
        assert!(prompt.contains("务必先读取再回答问题"));
        assert!(prompt.contains("## 工作目录"));
        assert!(prompt.contains("/workspace"));
    }

    #[test]
    fn test_build_team_composition_v2_uses_role_names() {
        let ctx = sample_role_context();
        let composition = build_team_composition_v2("Alice", "Product Manager", &ctx);

        // 使用稳定的角色名称，不再使用字母编号
        assert!(composition.contains("## 当前团队配置"));
        assert!(composition.contains("- Alice - Product Manager （你）"));
        assert!(composition.contains("- Bob - Developer"));
        // 使用结构化 [HANDOFF] 块格式
        assert!(composition.contains("[HANDOFF]"));
        assert!(composition.contains("[/HANDOFF]"));
        assert!(composition.contains("target_role:"));
        assert!(composition.contains("recommended:"));
        assert!(composition.contains("reason:"));
        assert!(composition.contains("draft_message:"));
        // 示例中包含实际的 target 成员名
        assert!(composition.contains("target_role: Bob"));
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
            Some("src-tauri/resources/role-definitions/product_manager.md"),
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
