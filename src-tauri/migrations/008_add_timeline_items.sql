-- Add timeline_items table to store detailed timeline data for messages
CREATE TABLE timeline_items (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('thinking', 'tool_call', 'output')),
    timestamp INTEGER NOT NULL,  -- Unix timestamp in milliseconds (e.g., 1715155200000)
    content TEXT,
    tool TEXT,
    action TEXT,
    status TEXT CHECK(status IN ('running', 'success', 'error')),
    result TEXT,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- Index for efficient timeline queries
CREATE INDEX idx_timeline_items_message_id ON timeline_items(message_id);
CREATE INDEX idx_timeline_items_timestamp ON timeline_items(timestamp);
-- Composite index for optimized sorting queries (message_id + timestamp)
CREATE INDEX idx_timeline_items_message_timestamp ON timeline_items(message_id, timestamp);
