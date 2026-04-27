use crate::archetypes::RoleArchetype;

pub const TASK_PROMPT_CONTRACT_VERSION: &str = "task-role-v2";

pub fn platform_rules_prompt(handoff_enabled: bool) -> String {
    let mut rules = vec![
        "你是多角色协作任务中的一个成员。",
        "你只能完成当前角色职责范围内的工作。",
        "你不能自行切换角色。",
        "handoff 只是建议，必须等待用户确认。",
    ];

    if handoff_enabled {
        rules.push("当你认为下一阶段应由其他角色继续时，可以输出 HANDOFF 块提出建议。");
    } else {
        rules.push("当前角色不负责提出交接建议，除非用户明确要求你这样做。");
    }

    rules.join("\n")
}

pub fn build_role_system_prompt(
    archetype: Option<&RoleArchetype>,
    role_name: &str,
    role_identity: &str,
    task_name: &str,
    task_description: &str,
    system_prompt_append: Option<&str>,
    handoff_enabled: bool,
) -> String {
    let mut sections = Vec::new();

    sections.push(platform_rules_prompt(handoff_enabled));
    sections.push(format!(
        "当前任务名称：{}\n当前角色名称：{}\n当前角色身份：{}",
        task_name, role_name, role_identity
    ));

    if let Some(archetype) = archetype {
        sections.push(format!(
            "角色原型：{}\n摘要：{}\n描述：{}",
            archetype.label, archetype.summary, archetype.description
        ));

        if !archetype.responsibilities.is_empty() {
            sections.push(format!(
                "职责范围：\n{}",
                archetype
                    .responsibilities
                    .iter()
                    .map(|item| format!("- {}", item))
                    .collect::<Vec<_>>()
                    .join("\n")
            ));
        }

        if !archetype.boundaries.is_empty() {
            sections.push(format!(
                "边界约束：\n{}",
                archetype
                    .boundaries
                    .iter()
                    .map(|item| format!("- {}", item))
                    .collect::<Vec<_>>()
                    .join("\n")
            ));
        }

        if !archetype.deliverables.is_empty() {
            sections.push(format!(
                "建议产出：\n{}",
                archetype
                    .deliverables
                    .iter()
                    .map(|item| format!("- {}", item))
                    .collect::<Vec<_>>()
                    .join("\n")
            ));
        }

        sections.push(format!(
            "角色协作指引：{}\n任务执行指引：{}\n交接建议：{}",
            archetype.prompt_fragments.team_guidance,
            archetype.prompt_fragments.task_guidance,
            archetype.handoff_guidance
        ));

        if !archetype.prompt_fragments.role_system.trim().is_empty() {
            sections.push(archetype.prompt_fragments.role_system.clone());
        }
    }

    if !task_description.trim().is_empty() {
        sections.push(format!("任务说明：\n{}", task_description.trim()));
    }

    if let Some(append_prompt) = system_prompt_append.map(str::trim).filter(|value| !value.is_empty()) {
        sections.push(format!("额外系统提示追加：\n{}", append_prompt));
    }

    sections.join("\n\n")
}

pub fn build_custom_role_system_prompt(
    role_name: &str,
    role_identity: &str,
    task_name: &str,
    task_description: &str,
    custom_system_prompt: &str,
    handoff_enabled: bool,
    pm_first_workflow: bool,
) -> String {
    let mut sections = vec![build_role_system_prompt(
        None,
        role_name,
        role_identity,
        task_name,
        task_description,
        None,
        handoff_enabled,
    )];

    if pm_first_workflow {
        sections.push(pm_first_workflow_prompt(role_identity));
    }

    sections.push(format!(
        "自定义角色完整系统提示：\n{}",
        custom_system_prompt.trim()
    ));

    sections.join("\n\n")
}

pub fn pm_first_workflow_prompt(role_identity: &str) -> String {
    let normalized_identity = role_identity.trim().to_lowercase();
    let is_product_manager = normalized_identity == "product manager"
        || normalized_identity == "pm"
        || normalized_identity == "项目经理"
        || normalized_identity == "产品经理";

    if is_product_manager {
        "当前任务启用了 PM First Workflow。你必须先阅读 docs/v2/task-template-system-proposal.md，再结合用户当前目标判断该提案是否已经可以进入开发。你的首要输出必须覆盖：1）是否建议开始开发；2）最小可执行范围；3）下一位应该接手的角色；4）建议用户发给下一位角色的完整消息。不要直接开始实现。".to_string()
    } else {
        "当前任务启用了 PM First Workflow。只有在用户已先与 Product Manager 对齐范围，并明确把工作交接给你之后，你才进入执行。若上下文中缺少 PM 的决策、范围或交接消息，你应先指出缺失信息，而不是直接开始实现。".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_custom_role_system_prompt,
        build_role_system_prompt,
        pm_first_workflow_prompt,
    };
    use crate::archetypes::loader::{PromptFragments, RoleArchetype, SourceMetadata};

    fn sample_archetype() -> RoleArchetype {
        RoleArchetype {
            id: "frontend_developer".to_string(),
            label: "Frontend Developer".to_string(),
            summary: "负责前端实现。".to_string(),
            description: "负责 UI 与交互实现。".to_string(),
            responsibilities: vec!["实现界面".to_string(), "维护状态逻辑".to_string()],
            boundaries: vec!["不做产品裁决".to_string()],
            deliverables: vec!["实现方案".to_string()],
            handoff_guidance: "实现完成后建议交给评审角色。".to_string(),
            recommended_next_archetypes: vec!["code_reviewer".to_string()],
            prompt_fragments: PromptFragments {
                role_system: "你是前端工程角色。".to_string(),
                team_guidance: "与其他角色协作。".to_string(),
                task_guidance: "专注前端实现。".to_string(),
            },
            source: SourceMetadata {
                repository: "agency-agents".to_string(),
                path: "engineering/frontend.md".to_string(),
            },
        }
    }

    #[test]
    fn build_role_system_prompt_includes_archetype_and_append_layers() {
        let prompt = build_role_system_prompt(
            Some(&sample_archetype()),
            "Alice",
            "Developer",
            "Build dashboard",
            "实现仪表盘页面",
            Some("必须输出明确的交接建议"),
            true,
        );

        assert!(prompt.contains("当前任务名称：Build dashboard"));
        assert!(prompt.contains("角色原型：Frontend Developer"));
        assert!(prompt.contains("职责范围："));
        assert!(prompt.contains("任务说明：\n实现仪表盘页面"));
        assert!(prompt.contains("额外系统提示追加：\n必须输出明确的交接建议"));
    }

    #[test]
    fn build_custom_role_system_prompt_wraps_team_context_and_custom_prompt() {
        let prompt = build_custom_role_system_prompt(
            "Alice",
            "Researcher",
            "Plan rollout",
            "先完成调研",
            "你必须输出严格的调研报告。",
            true,
            false,
        );

        assert!(prompt.contains("你是多角色协作任务中的一个成员。"));
        assert!(prompt.contains("当前角色名称：Alice"));
        assert!(prompt.contains("当前角色身份：Researcher"));
        assert!(prompt.contains("自定义角色完整系统提示：\n你必须输出严格的调研报告。"));
    }

    #[test]
    fn pm_first_workflow_prompt_changes_for_product_manager() {
        let pm_prompt = pm_first_workflow_prompt("Product Manager");
        let engineer_prompt = pm_first_workflow_prompt("Software Engineer");

        assert!(pm_prompt.contains("docs/v2/task-template-system-proposal.md"));
        assert!(pm_prompt.contains("下一位应该接手的角色"));
        assert!(engineer_prompt.contains("只有在用户已先与 Product Manager 对齐范围"));
    }
}
