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
