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
