-- Task templates: store system and user templates in SQLite
CREATE TABLE IF NOT EXISTS task_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'team',
    category TEXT,
    source TEXT NOT NULL CHECK(source IN ('system', 'user')),
    pm_first_workflow BOOLEAN NOT NULL DEFAULT 1,
    tags_json TEXT NOT NULL DEFAULT '[]',
    source_path TEXT,
    source_task_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_template_roles (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    name TEXT NOT NULL,
    identity TEXT NOT NULL DEFAULT '',
    archetype_id TEXT,
    system_prompt_append TEXT,
    custom_system_prompt TEXT,
    model TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '',
    handoff_enabled BOOLEAN NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES task_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_templates_source ON task_templates(source);
CREATE INDEX IF NOT EXISTS idx_task_templates_updated_at ON task_templates(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_template_roles_template_id ON task_template_roles(template_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_template_roles_template_order ON task_template_roles(template_id, display_order);

CREATE TRIGGER IF NOT EXISTS task_templates_update_timestamp
AFTER UPDATE ON task_templates
BEGIN
    UPDATE task_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS task_template_roles_update_timestamp
AFTER UPDATE ON task_template_roles
BEGIN
    UPDATE task_template_roles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

INSERT OR IGNORE INTO task_templates (
    id, name, description, icon, category, source, pm_first_workflow, tags_json, source_path
) VALUES
    (
        'tpl-dev-team',
        'Development Team',
        'A collaborative software delivery team with PM, frontend, backend, and QA roles.',
        'team',
        'development',
        'system',
        1,
        '["development","full-stack","team"]',
        'src-tauri/resources/templates/dev-team.md'
    ),
    (
        'tpl-writing-team',
        'Writing Team',
        'A content production team for drafting, editing, and reviewing documents.',
        'edit',
        'writing',
        'system',
        0,
        '["writing","content","editing"]',
        'src-tauri/resources/templates/writing-team.md'
    ),
    (
        'tpl-analysis-team',
        'Analysis Team',
        'An analysis-focused team for research, synthesis, and reporting.',
        'chart',
        'analysis',
        'system',
        0,
        '["analysis","data","visualization"]',
        'src-tauri/resources/templates/analysis-team.md'
    );

INSERT OR IGNORE INTO task_template_roles (
    id, template_id, name, identity, archetype_id, system_prompt_append, custom_system_prompt, model, provider, handoff_enabled, display_order
) VALUES
    ('tpl-dev-team-role-1', 'tpl-dev-team', 'Product Manager', 'Owns scoping, backlog definition, and acceptance criteria.', 'product_manager', NULL, NULL, '', '', 1, 0),
    ('tpl-dev-team-role-2', 'tpl-dev-team', 'Frontend Engineer', 'Implements UI flows, component structure, and frontend integration details.', 'frontend_engineer', NULL, NULL, '', '', 1, 1),
    ('tpl-dev-team-role-3', 'tpl-dev-team', 'Backend Engineer', 'Designs APIs, persistence, and backend integration work.', 'backend_engineer', NULL, NULL, '', '', 1, 2),
    ('tpl-dev-team-role-4', 'tpl-dev-team', 'QA Engineer', 'Verifies behavior, documents risks, and validates release readiness.', 'qa_engineer', NULL, NULL, '', '', 1, 3),

    ('tpl-writing-team-role-1', 'tpl-writing-team', 'Lead Writer', 'Creates the first complete draft with structure and tone.', 'writer', NULL, NULL, '', '', 1, 0),
    ('tpl-writing-team-role-2', 'tpl-writing-team', 'Editor', 'Improves clarity, structure, and consistency across the document.', 'editor', NULL, NULL, '', '', 1, 1),
    ('tpl-writing-team-role-3', 'tpl-writing-team', 'Reviewer', 'Checks correctness, completeness, and audience fit before publishing.', 'reviewer', NULL, NULL, '', '', 1, 2),

    ('tpl-analysis-team-role-1', 'tpl-analysis-team', 'Research Analyst', 'Collects facts, references, and source material for the team.', 'research_analyst', NULL, NULL, '', '', 1, 0),
    ('tpl-analysis-team-role-2', 'tpl-analysis-team', 'Data Analyst', 'Synthesizes findings, identifies patterns, and validates assumptions.', 'data_analyst', NULL, NULL, '', '', 1, 1),
    ('tpl-analysis-team-role-3', 'tpl-analysis-team', 'Report Writer', 'Turns findings into clear recommendations and final narrative output.', 'report_writer', NULL, NULL, '', '', 1, 2);
