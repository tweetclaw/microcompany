UPDATE sessions
SET working_directory = (
    SELECT value
    FROM app_settings
    WHERE key = 'working_directory'
    LIMIT 1
)
WHERE type = 'task'
  AND (working_directory IS NULL OR TRIM(working_directory) = '')
  AND EXISTS (
      SELECT 1
      FROM app_settings
      WHERE key = 'working_directory'
        AND value IS NOT NULL
        AND TRIM(value) <> ''
  );
