ALTER TABLE tasks ADD COLUMN pm_first_workflow INTEGER NOT NULL DEFAULT 0;
ALTER TABLE roles ADD COLUMN prompt_source_type TEXT NULL;
ALTER TABLE roles ADD COLUMN prompt_hash TEXT NULL;
ALTER TABLE roles ADD COLUMN prompt_contract_version TEXT NULL;
