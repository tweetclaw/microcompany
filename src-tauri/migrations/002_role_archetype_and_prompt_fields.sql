ALTER TABLE roles ADD COLUMN archetype_id TEXT NULL;
ALTER TABLE roles ADD COLUMN system_prompt_snapshot TEXT NULL;
ALTER TABLE roles ADD COLUMN handoff_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE roles ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;

UPDATE roles
SET display_order = created_row_number.display_order
FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY created_at, id) - 1 AS display_order
    FROM roles
) AS created_row_number
WHERE roles.id = created_row_number.id;
