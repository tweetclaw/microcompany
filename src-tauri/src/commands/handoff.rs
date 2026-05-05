use crate::handoff_observer::{extract_handoff_from_tag, HandoffInfo};

// 智能路由配置加载（已暂停使用）
// use crate::config::AppConfig;

#[tauri::command]
pub async fn extract_handoff_suggestion(
    role_name: String,
    last_message: String,
    _available_roles: Vec<String>,
) -> Result<HandoffInfo, String> {
    log::info!("📞 [Handoff Command] 收到交接提取请求");
    log::info!("📞 [Handoff Command] 角色名称: {}", role_name);
    log::info!("📞 [Handoff Command] 消息长度: {} 字符", last_message.len());

    // 使用简单标签解析
    log::info!("📞 [Handoff Command] 开始解析标签...");
    let result = extract_handoff_from_tag(&last_message)
        .map_err(|e| {
            log::error!("❌ [Handoff Command] 标签解析失败: {}", e);
            e.to_string()
        })?;

    log::info!("✅ [Handoff Command] 标签解析成功");
    log::info!("✅ [Handoff Command] 返回结果 - has_handoff: {}", result.has_handoff);
    if let Some(ref suggested_role) = result.suggested_role {
        log::info!("✅ [Handoff Command] 返回结果 - suggested_role: {}", suggested_role);
    }

    Ok(result)
}

/* ========== 智能路由配置加载（已暂停使用）==========
#[tauri::command]
pub async fn extract_handoff_suggestion_with_ai(
    role_name: String,
    last_message: String,
    available_roles: Vec<String>,
) -> Result<HandoffInfo, String> {
    log::info!("📞 [Handoff Command] 收到交接提取请求");
    log::info!("📞 [Handoff Command] 角色名称: {}", role_name);
    log::info!("📞 [Handoff Command] 消息长度: {} 字符", last_message.len());
    log::info!("📞 [Handoff Command] 可用角色数量: {}", available_roles.len());

    // 1. 加载默认 provider 配置
    log::info!("📞 [Handoff Command] 加载配置...");
    let config = AppConfig::load().map_err(|e| {
        log::error!("❌ [Handoff Command] 配置加载失败: {}", e);
        e.to_string()
    })?;
    log::info!("📞 [Handoff Command] 配置加载成功");

    // 2. 优先使用 routing_config，如果没有则使用 active_provider
    let (api_key, model, base_url, config_source) = if let Some(routing) = &config.routing_config {
        if !routing.api_key.is_empty() {
            log::info!("✅ [Handoff Command] 使用智能路由专用配置");
            log::info!("📍 [Handoff Command] 路由模型: {}", routing.model);
            log::info!("📍 [Handoff Command] 路由 Base URL: https://api.deepseek.com");
            log::info!("📍 [Handoff Command] API Key 长度: {} 字符", routing.api_key.len());
            (
                routing.api_key.clone(),
                routing.model.clone(),
                Some("https://api.deepseek.com".to_string()),
                "routing_config",
            )
        } else {
            log::warn!("⚠️ [Handoff Command] 智能路由配置存在但 API key 为空，回退到 active provider");
            let active_provider = config.providers
                .iter()
                .find(|p| p.id == config.active_provider)
                .ok_or_else(|| {
                    log::error!("❌ [Handoff Command] 未找到 active provider");
                    "No active provider found".to_string()
                })?;
            log::info!("📍 [Handoff Command] Active provider ID: {}", config.active_provider);
            log::info!("📍 [Handoff Command] Provider 名称: {}", active_provider.name);
            log::info!("📍 [Handoff Command] Provider 模型: {}", active_provider.model);
            log::info!("📍 [Handoff Command] Provider Base URL: {:?}", active_provider.base_url);
            (
                active_provider.api_key.clone(),
                active_provider.model.clone(),
                active_provider.base_url.clone(),
                "active_provider",
            )
        }
    } else {
        log::info!("ℹ️ [Handoff Command] 智能路由配置不存在，使用 active provider");
        let active_provider = config.providers
            .iter()
            .find(|p| p.id == config.active_provider)
            .ok_or_else(|| {
                log::error!("❌ [Handoff Command] 未找到 active provider");
                "No active provider found".to_string()
            })?;
        log::info!("📍 [Handoff Command] Active provider ID: {}", config.active_provider);
        log::info!("📍 [Handoff Command] Provider 名称: {}", active_provider.name);
        log::info!("📍 [Handoff Command] Provider 模型: {}", active_provider.model);
        log::info!("📍 [Handoff Command] Provider Base URL: {:?}", active_provider.base_url);
        (
            active_provider.api_key.clone(),
            active_provider.model.clone(),
            active_provider.base_url.clone(),
            "active_provider",
        )
    };

    log::info!("🎯 [Handoff Command] 最终使用配置源: {}", config_source);

    // 3. 调用提取函数
    log::info!("📞 [Handoff Command] 开始调用观察者提取函数...");
    let result = extract_handoff_info(
        &role_name,
        &last_message,
        available_roles,
        &api_key,
        &model,
        base_url.as_deref(),
    )
    .await
    .map_err(|e| {
        log::error!("❌ [Handoff Command] 观察者提取失败: {}", e);
        e.to_string()
    })?;

    log::info!("✅ [Handoff Command] 观察者提取成功");
    log::info!("✅ [Handoff Command] 返回结果 - has_handoff: {}", result.has_handoff);
    if result.has_handoff {
        log::info!("✅ [Handoff Command] 返回结果 - suggested_role: {}", result.suggested_role);
        log::info!("✅ [Handoff Command] 返回结果 - task_summary: {}", result.task_summary);
    }

    Ok(result)
}
========== 智能路由配置加载结束 ==========
*/
