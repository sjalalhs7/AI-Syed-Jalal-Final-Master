CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('Admin','Manager','Data Operator','Viewer')),
  salt text NOT NULL,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS records (
  id text PRIMARY KEY,
  name text NOT NULL,
  region text NOT NULL DEFAULT '',
  sector text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Active',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES app_users(id),
  updated_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES app_users(id)
);
CREATE INDEX IF NOT EXISTS idx_records_region ON records(region);
CREATE INDEX IF NOT EXISTS idx_records_sector ON records(sector);
CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_deleted_at ON records(deleted_at);
CREATE TABLE IF NOT EXISTS record_history (
  id uuid PRIMARY KEY,
  record_id text NOT NULL,
  user_id uuid REFERENCES app_users(id),
  action text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_record_history_record ON record_history(record_id,created_at DESC);
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES app_users(id),
  action text NOT NULL,
  detail text NOT NULL DEFAULT '',
  ip text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_events(created_at DESC);
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY,
  record_id text REFERENCES records(id) ON DELETE SET NULL,
  title text NOT NULL,
  document_type text NOT NULL DEFAULT 'General',
  storage_key text NOT NULL,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_documents_record ON documents(record_id);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC);

-- V38 observability: correlate audit records with HTTP requests.
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS request_id text;
CREATE INDEX IF NOT EXISTS idx_audit_request_id ON audit_events(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_records_region_sector ON records(region,sector);
CREATE INDEX IF NOT EXISTS idx_records_active_updated ON records(updated_at DESC) WHERE deleted_at IS NULL;

-- V40 performance indexes for common Data Vault filters/search paths.
CREATE INDEX IF NOT EXISTS idx_records_status_updated ON records(status,updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_records_name_lower ON records((lower(name))) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_records_id_lower ON records((lower(id))) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY,
  action text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);
CREATE INDEX IF NOT EXISTS idx_approvals_status_created ON approvals(status,created_at ASC);

-- Atomic token-bucket state for login and AI request limits. Subject identifiers are SHA-256 hashes.
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  scope text NOT NULL,
  subject_hash text NOT NULL,
  tokens numeric(12,6) NOT NULL CHECK (tokens >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_request_id uuid NOT NULL,
  PRIMARY KEY (scope, subject_hash)
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated_at ON auth_rate_limits(updated_at);

-- V128 assistant tools (also in migrations/006_v128_assistant_tools.sql)
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

-- V133: agent skill library and durable self-check evidence (fresh-database copy).
CREATE TABLE IF NOT EXISTS agent_skills (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 3 AND 120),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  domain text NOT NULL CHECK (length(domain) BETWEEN 1 AND 120),
  family text NOT NULL DEFAULT '' CHECK (length(family) <= 120),
  capability text NOT NULL DEFAULT 'expert' CHECK (length(capability) <= 40),
  objective text NOT NULL DEFAULT '' CHECK (length(objective) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_skills_domain ON agent_skills(domain, name);
CREATE TABLE IF NOT EXISTS agent_self_checks (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  engine text NOT NULL CHECK (engine IN ('local','cloud')),
  provider text NOT NULL DEFAULT 'local' CHECK (length(provider) <= 40),
  checks_total integer NOT NULL DEFAULT 0 CHECK (checks_total >= 0),
  checks_passed integer NOT NULL DEFAULT 0 CHECK (checks_passed >= 0),
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  verdict text NOT NULL CHECK (verdict IN ('pass','warn','fail')),
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_self_checks_user ON agent_self_checks(user_id, created_at DESC);
