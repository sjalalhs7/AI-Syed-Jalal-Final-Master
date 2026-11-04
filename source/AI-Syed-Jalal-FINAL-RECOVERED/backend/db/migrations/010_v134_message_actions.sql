-- V134: copy / regenerate support for Agent Studio.
-- reply_to groups the assistant reply that answered a user message, so pressing
-- Copy or Regenerate inside one bubble affects exactly that reply (both compare
-- sides share the same anchor). Additive and replay-safe.
ALTER TABLE platform_messages ADD COLUMN IF NOT EXISTS reply_to uuid;
CREATE INDEX IF NOT EXISTS idx_platform_messages_reply_to ON platform_messages(reply_to);

-- Generation state for a reply: 'ok' when the answer was produced, 'failed' when the
-- stored row has no answer yet (the client can retry it with the same row id).
ALTER TABLE platform_messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ok'
  CHECK (status IN ('ok','failed'));
CREATE INDEX IF NOT EXISTS idx_platform_messages_failed ON platform_messages(conversation_id) WHERE status = 'failed';
