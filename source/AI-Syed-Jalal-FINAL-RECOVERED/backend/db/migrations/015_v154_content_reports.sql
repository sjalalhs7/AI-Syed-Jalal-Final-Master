-- User-submitted reports only. Reports are not collected automatically.
-- A deleted account's reports are removed with that account; the operator must
-- separately define a real retention and deletion policy before publication.
CREATE TABLE IF NOT EXISTS content_reports (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  surface text NOT NULL CHECK (surface IN ('home','workspace','dashboard','jalalai','jarvis','agent','arena','toolbench')),
  category text NOT NULL CHECK (category IN ('offensive','unsafe','misleading','other')),
  excerpt text NOT NULL CHECK (length(excerpt) BETWEEN 1 AND 5000),
  details text NOT NULL DEFAULT '' CHECK (length(details) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_content_reports_queue ON content_reports(status, created_at DESC);
