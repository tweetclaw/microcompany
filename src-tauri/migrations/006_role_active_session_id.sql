ALTER TABLE roles ADD COLUMN active_session_id TEXT NULL;

UPDATE roles
SET active_session_id = (
    SELECT s.id
    FROM sessions s
    WHERE s.role_id = roles.id
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT 1
)
WHERE active_session_id IS NULL;
