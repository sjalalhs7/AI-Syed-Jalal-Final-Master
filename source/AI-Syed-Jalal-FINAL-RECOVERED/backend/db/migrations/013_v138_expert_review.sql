-- V138: expert review evidence. One row per review run, with the dimension
-- scores and findings exactly as they were produced. Additive and replay-safe.
CREATE TABLE IF NOT EXISTS expert_reviews (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'full' CHECK (mode IN ('full','security','honesty','usability')),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  verdict text NOT NULL CHECK (verdict IN ('ready','conditional','not-ready')),
  dimensions jsonb NOT NULL DEFAULT '[]'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expert_reviews_user ON expert_reviews(user_id, created_at DESC);
