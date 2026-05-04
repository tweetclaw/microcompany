use crate::config::AppConfig;
use crate::handoff_observer::{extract_handoff_info, HandoffInfo};

#[tauri::command]
pub async fn extract_handoff_suggestion(
    role_name: String,
    last_message: String,
) -> Result<HandoffInfo, String> {
    log::info!("📞 [Handoff Command] 收到交接提取请求");
    log::info!("📞 [Handoff Command] 角色名称: {}", role_name);
    log::info!("📞 [Handoff Command] 消息长度: {} 字符", last_message.len());

    // 1. 加载默认 provider 配置
    log::info!("📞 [Handoff Command] 加载配置...");
    let config = AppConfig::load().map_err(|e| {
        log::error!("❌ [Handoff Command] 配置加载失败: {}", e);
        e.to_string()
    })?;
    log::info!("📞 [Handoff Command] 配置加载成功");

    // 2. 获取 active provider
    log::info!("📞 [Handoff Command] Active provider ID: {}", config.active_provider);
    let active_provider = config.providers
        .iter()
        .find(|p| p.id == config.active_provider)
        .ok_or_else(|| {
            log::error!("❌ [Handoff Command] 未找到 active provider");
            "No active provider found".to_string()
        })?;

    log::info!("📞 [Handoff Command] Provider 名称: {}", active_provider.name);
    log::info!("📞 [Handoff Command] Provider 模型: {}", active_provider.model);

    // 3. 调用提取函数
    log::info!("📞 [Handoff Command] 开始调用观察者提取函数...");
    let result = extract_handoff_info(
        &role_name,
        &last_message,
        &active_provider.api_key,
        &active_provider.model,
        active_provider.base_url.as_deref(),
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
