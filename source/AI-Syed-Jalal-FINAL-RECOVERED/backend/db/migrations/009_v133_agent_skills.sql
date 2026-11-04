-- V133: agent skill library + durable agent-runtime evaluation records.
-- Additive only: no destructive statements, safe to replay against existing data.

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

-- One row per self-check run. Results are evidence, not a production certificate.
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
