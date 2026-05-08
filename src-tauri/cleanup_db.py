#!/usr/bin/env python3
import sqlite3
import os
from pathlib import Path

db_path = Path.home() / ".microcompany" / "data.db"

# Backup first
import shutil
import time
backup_path = f"{db_path}.backup.{int(time.time())}"
shutil.copy2(db_path, backup_path)
print(f"Backup created: {backup_path}")

# Connect and update
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Clear content for messages that have timeline items
cursor.execute("""
    UPDATE messages
    SET content = ''
    WHERE role = 'assistant'
      AND id IN (
        SELECT DISTINCT message_id
        FROM timeline_items
      )
""")

affected = cursor.rowcount
conn.commit()
conn.close()

print(f"Updated {affected} messages - cleared content field for messages with timeline items")
