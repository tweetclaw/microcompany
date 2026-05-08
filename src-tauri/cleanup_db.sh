#!/bin/bash
# Cleanup script to clear message content for messages with timeline items

DB_PATH="$HOME/.microcompany/data.db"

# Use the app's database connection by calling a Tauri command
# For now, let's just manually update using a simpler approach

# First, backup the database
cp "$DB_PATH" "$DB_PATH.backup.$(date +%s)"

# Use sqlite3 with a simpler query that doesn't trigger FTS5
sqlite3 "$DB_PATH" <<EOF
PRAGMA foreign_keys = OFF;
UPDATE messages
SET content = ''
WHERE role = 'assistant'
  AND id IN (
    SELECT DISTINCT message_id
    FROM timeline_items
  );
PRAGMA foreign_keys = ON;
EOF

echo "Database cleanup completed. Backup saved."
