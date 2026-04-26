use crate::archetypes::RoleArchetype;

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

#[cfg(test)]
mod tests {
    use super::build_role_system_prompt;
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
}
