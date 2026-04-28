use crate::archetypes::RoleArchetype;

pub const TASK_PROMPT_CONTRACT_VERSION: &str = "task-role-v5-roster-only-handoff";

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

fn format_role_label(role: &TeamRolePromptContext) -> String {
    match role.archetype_id.as_deref().filter(|value| !value.is_empty()) {
        Some(archetype_id) => format!("{}（身份：{}；archetype：{}）", role.name, role.identity, archetype_id),
        None => format!("{}（身份：{}）", role.name, role.identity),
    }
}

fn build_active_role_contract(role_name: &str, role_identity: &str) -> String {
    format!(
        "当前激活角色契约：\n- 你现在就是这个任务会话中的 {}（角色名称：{}）。\n- 你必须以这个角色的第一人称视角直接与用户对话、思考和推进工作。\n- 你不能把“{}”当成另一个外部人员，也不能建议用户再去联系“{}”。\n- 在用户明确确认 handoff 之前，你始终是当前正在发言和负责推进的角色。",
        role_identity,
        role_name,
        role_identity,
        role_identity
    )
}

fn build_team_context(role_context: Option<&RolePromptContext>) -> Option<String> {
    let context = role_context?;
    if context.roster.is_empty() {
        return None;
    }

    let roster = context
        .roster
        .iter()
        .enumerate()
        .map(|(index, role)| format!("{}. {}", index + 1, format_role_label(role)))
        .collect::<Vec<_>>()
        .join("\n");

    let current_position = format!("你是当前团队中的第 {} / {} 个角色。", context.active_role_index + 1, context.roster.len());

    let handoff_targets = if context.recommended_handoff_roles.is_empty() {
        "当前任务中没有解析出明确的推荐下游角色；如果你建议 handoff，只能在现有团队成员范围内提出。".to_string()
    } else {
        format!(
            "结合当前任务配置，你优先可以考虑的下游协作/交接角色是：{}。",
            context
                .recommended_handoff_roles
                .iter()
                .map(format_role_label)
                .collect::<Vec<_>>()
                .join("、")
        )
    };

    Some(format!(
        "团队上下文：\n- 你正在一个真实存在的任务团队中工作，而不是单独扮演抽象角色。\n- 当前任务团队成员如下：\n{}\n- {}\n- {}",
        roster,
        current_position,
        handoff_targets
    ))
}

fn build_handoff_output_contract(
    role_context: Option<&RolePromptContext>,
    role_identity: &str,
) -> Option<String> {
    let context = role_context?;

    let allowed_targets = context
        .roster
        .iter()
        .enumerate()
        .filter(|(index, _)| *index != context.active_role_index)
        .map(|(_, role)| format_role_label(role))
        .collect::<Vec<_>>();

    let recommended_targets = context
        .recommended_handoff_roles
        .iter()
        .map(format_role_label)
        .collect::<Vec<_>>();

    let normalized_identity = role_identity.trim();
    let allowed_targets_summary = if allowed_targets.is_empty() {
        "当前任务里没有其他可交接角色。".to_string()
    } else {
        format!("当前任务里，除你之外可作为“下一位角色”的对象只有：{}。", allowed_targets.join("、"))
    };

    let recommended_targets_summary = if recommended_targets.is_empty() {
        "如果你建议 handoff，但当前没有解析出明确推荐下游角色，你也只能在上面这些真实团队成员中选择；不能虚构团队外角色，也不能把同身份角色当作外部联系对象。".to_string()
    } else {
        format!(
            "如果你建议 handoff，优先从这些真实下游角色中选择：{}。不要跳过它们去推荐一个泛化职位。",
            recommended_targets.join("、")
        )
    };

    Some(format!(
        "交接输出约束：\n- {}\n- 你绝不能把“{}”或任何同身份角色再次推荐为下一位角色。\n- 你绝不能推荐团队 roster 之外的泛化职位（如 PM、产品负责人、负责人、业务方），除非该对象就在当前 roster 中且不是你自己。\n- 如果你判断当前阶段还不应该交接，就明确写“当前暂不交接，继续由我推进下一步”，不要虚构一个外部联系对象。\n- 如果用户要求你给出“发给下一位角色的消息”，那条消息也只能发给当前任务 roster 中的真实其他角色；若当前暂不交接，就明确写“当前无需发送交接消息，因为此阶段仍由我继续推进”。\n- {}",
        allowed_targets_summary,
        normalized_identity,
        recommended_targets_summary,
    ))
}

pub fn build_role_system_prompt(
    archetype: Option<&RoleArchetype>,
    role_name: &str,
    role_identity: &str,
    task_name: &str,
    task_description: &str,
    system_prompt_append: Option<&str>,
    handoff_enabled: bool,
    role_context: Option<&RolePromptContext>,
) -> String {
    let mut sections = Vec::new();

    sections.push(platform_rules_prompt(handoff_enabled));
    sections.push(build_active_role_contract(role_name, role_identity));
    sections.push(format!(
        "当前任务名称：{}\n当前角色名称：{}\n当前角色身份：{}",
        task_name, role_name, role_identity
    ));

    if let Some(team_context) = build_team_context(role_context) {
        sections.push(team_context);
    }

    if let Some(handoff_output_contract) = build_handoff_output_contract(role_context, role_identity) {
        sections.push(handoff_output_contract);
    }

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
    role_context: Option<&RolePromptContext>,
) -> String {
    let mut sections = vec![build_role_system_prompt(
        None,
        role_name,
        role_identity,
        task_name,
        task_description,
        None,
        handoff_enabled,
        role_context,
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
        "当前任务启用了 PM First Workflow。你现在就是当前正在与用户直接对话的 Product Manager。你必须先阅读 docs/v2/task-template-system-proposal.md，再结合用户当前目标主动完成产品经理职责：澄清目标、范围、约束、优先级与验收边界，并给出下一步协作建议。你的首要输出必须覆盖：1）是否建议开始开发；2）最小可执行范围；3）下一位应该接手的角色；4）建议用户发给下一位角色的完整消息。你可以建议 handoff，但不能把 Product Manager 当成另一个外部角色，也不能让用户再去联系 PM；你自己就负责完成当前这轮 PM 工作。硬性约束：如果你输出“下一位应该接手的角色”或“发给下一位角色的消息”，该角色绝不能是 Product Manager / PM / 项目经理 / 产品经理，也不能与当前激活角色是同一身份；如果你发现自己推荐的还是当前角色，必须先改写答案，再输出最终结果。不要直接开始实现。".to_string()
    } else {
        "当前任务启用了 PM First Workflow。只有在用户已先与当前任务中的 Product Manager 对齐范围，并明确把工作交接给你之后，你才进入执行。若上下文中缺少 PM 的决策、范围或交接消息，你应先指出缺失信息，而不是直接开始实现。".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_custom_role_system_prompt,
        build_role_system_prompt,
        pm_first_workflow_prompt,
        RolePromptContext,
        TeamRolePromptContext,
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
                    archetype_id: Some("frontend_developer".to_string()),
                },
                TeamRolePromptContext {
                    name: "Carol".to_string(),
                    identity: "Reviewer".to_string(),
                    archetype_id: Some("code_reviewer".to_string()),
                },
            ],
            active_role_index: 1,
            recommended_handoff_roles: vec![TeamRolePromptContext {
                name: "Carol".to_string(),
                identity: "Reviewer".to_string(),
                archetype_id: Some("code_reviewer".to_string()),
            }],
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
            Some(&sample_role_context()),
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
            Some(&sample_role_context()),
        );

        assert!(prompt.contains("你是多角色协作任务中的一个成员。"));
        assert!(prompt.contains("当前角色名称：Alice"));
        assert!(prompt.contains("当前角色身份：Researcher"));
        assert!(prompt.contains("自定义角色完整系统提示：\n你必须输出严格的调研报告。"));
    }

    #[test]
    fn build_role_system_prompt_includes_active_role_contract_and_team_context() {
        let prompt = build_role_system_prompt(
            Some(&sample_archetype()),
            "Bob",
            "Developer",
            "Build dashboard",
            "实现仪表盘页面",
            None,
            true,
            Some(&sample_role_context()),
        );

        assert!(prompt.contains("当前激活角色契约："));
        assert!(prompt.contains("你必须以这个角色的第一人称视角直接与用户对话"));
        assert!(prompt.contains("团队上下文："));
        assert!(prompt.contains("交接输出约束："));
        assert!(prompt.contains("当前任务里，除你之外可作为“下一位角色”的对象只有"));
        assert!(prompt.contains("你绝不能推荐团队 roster 之外的泛化职位"));
        assert!(prompt.contains("1. Alice（身份：Product Manager；archetype：product_manager）"));
        assert!(prompt.contains("你是当前团队中的第 2 / 3 个角色。"));
        assert!(prompt.contains("Carol（身份：Reviewer；archetype：code_reviewer）"));
    }

    #[test]
    fn build_role_system_prompt_limits_handoff_to_real_team_members() {
        let role_context = RolePromptContext {
            active_role_index: 0,
            ..sample_role_context()
        };

        let prompt = build_role_system_prompt(
            Some(&sample_archetype()),
            "Alice",
            "Product Manager",
            "Build dashboard",
            "实现仪表盘页面",
            None,
            true,
            Some(&role_context),
        );

        assert!(prompt.contains("交接输出约束："));
        assert!(prompt.contains("当前任务里，除你之外可作为“下一位角色”的对象只有：Bob（身份：Developer；archetype：frontend_developer）、Carol（身份：Reviewer；archetype：code_reviewer）。"));
        assert!(prompt.contains("你绝不能把“Product Manager”或任何同身份角色再次推荐为下一位角色。"));
        assert!(prompt.contains("如果用户要求你给出“发给下一位角色的消息”，那条消息也只能发给当前任务 roster 中的真实其他角色"));
    }

    #[test]
    fn pm_first_workflow_prompt_changes_for_product_manager() {
        let pm_prompt = pm_first_workflow_prompt("Product Manager");
        let engineer_prompt = pm_first_workflow_prompt("Software Engineer");

        assert!(pm_prompt.contains("docs/v2/task-template-system-proposal.md"));
        assert!(pm_prompt.contains("你现在就是当前正在与用户直接对话的 Product Manager"));
        assert!(pm_prompt.contains("不能让用户再去联系 PM"));
        assert!(pm_prompt.contains("该角色绝不能是 Product Manager / PM / 项目经理 / 产品经理"));
        assert!(pm_prompt.contains("如果你发现自己推荐的还是当前角色，必须先改写答案"));
        assert!(pm_prompt.contains("不要直接开始实现"));
        assert!(engineer_prompt.contains("只有在用户已先与当前任务中的 Product Manager 对齐范围"));
    }
}
