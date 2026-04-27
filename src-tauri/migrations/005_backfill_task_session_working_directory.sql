-- Legacy task sessions may have NULL working_directory.
-- Backfill is handled defensively at runtime in init_task_session,
-- because older databases may not have an app_settings table yet.
SELECT 1;
