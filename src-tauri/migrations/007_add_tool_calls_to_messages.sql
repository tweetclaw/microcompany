-- Add tool_calls column to messages table to store tool call records
ALTER TABLE messages ADD COLUMN tool_calls TEXT;
