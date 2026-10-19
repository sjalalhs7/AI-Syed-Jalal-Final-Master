CREATE TABLE IF NOT EXISTS ai_runs (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  agent_id text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL DEFAULT '',
  prompt text NOT NULL,
  output text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'completed',
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_created ON ai_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_agent ON ai_runs(agent_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_user ON ai_runs(user_id,created_at DESC);
