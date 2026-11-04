-- V136: Agent runtime evidence. One row per agent run, with the real tool
-- trace. Additive and replay-safe.
CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  prompt text NOT NULL CHECK (length(prompt) BETWEEN 1 AND 4000),
  surface text NOT NULL DEFAULT 'agent' CHECK (surface IN ('agent','assistant','arena')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  needs_provider boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs(user_id, created_at DESC);
