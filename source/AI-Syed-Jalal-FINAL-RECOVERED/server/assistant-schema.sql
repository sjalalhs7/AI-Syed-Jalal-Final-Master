CREATE TABLE IF NOT EXISTS assistant_tasks (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_tasks_user ON assistant_tasks(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS assistant_notes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_notes_user ON assistant_notes(user_id,created_at DESC);

-- V129: unified SJ Agent Studio conversations, messages and explicit history control.
CREATE TABLE IF NOT EXISTS platform_conversations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation' CHECK (length(title) BETWEEN 1 AND 160),
  mode text NOT NULL DEFAULT 'chat' CHECK (mode IN ('chat','agent','compare')),
  model_a text NOT NULL DEFAULT 'local',
  model_b text NOT NULL DEFAULT 'local-critic',
  history boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_conversations_user ON platform_conversations(user_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS platform_messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES platform_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 60000),
  provider text NOT NULL DEFAULT 'local',
  profile text NOT NULL DEFAULT 'general',
  mode text NOT NULL DEFAULT 'chat',
  side text CHECK (side IN ('a','b')),
  comparison_id uuid,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  action jsonb,
  vote text CHECK (vote IN ('a','b','tie')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_messages_conversation ON platform_messages(conversation_id,created_at ASC);

ALTER TABLE platform_messages ADD COLUMN IF NOT EXISTS comparison_id uuid;
CREATE INDEX IF NOT EXISTS idx_platform_messages_comparison ON platform_messages(comparison_id);

-- V134: copy / regenerate support.
ALTER TABLE platform_messages ADD COLUMN IF NOT EXISTS reply_to uuid;
CREATE INDEX IF NOT EXISTS idx_platform_messages_reply_to ON platform_messages(reply_to);
ALTER TABLE platform_messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','failed'));
CREATE INDEX IF NOT EXISTS idx_platform_messages_failed ON platform_messages(conversation_id) WHERE status = 'failed';
