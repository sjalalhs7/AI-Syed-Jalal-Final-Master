-- V135: Arena battles, judging evidence, artifacts and the model leaderboard.
-- Additive only; safe to replay against an existing database.

CREATE TABLE IF NOT EXISTS arena_battles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  prompt text NOT NULL CHECK (length(prompt) BETWEEN 1 AND 10000),
  mode text NOT NULL DEFAULT 'text' CHECK (mode IN ('text','code')),
  contenders jsonb NOT NULL DEFAULT '[]'::jsonb,
  blind boolean NOT NULL DEFAULT true,
  judge_id text NOT NULL DEFAULT 'sj-rubric-v1',
  judge_winner text CHECK (judge_winner IN ('a','b','c','d','tie')),
  judge_reason text NOT NULL DEFAULT '',
  -- User choice: a side, 'tie', or NULL when only the judge has spoken.
  vote text CHECK (vote IN ('a','b','c','d','tie')),
  -- 'judge' = rubric decided, 'user' = human decided, 'tie' = drew.
  decided_by text CHECK (decided_by IN ('judge','user','tie')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_arena_battles_user ON arena_battles(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_battles_mode ON arena_battles(mode, created_at DESC);

CREATE TABLE IF NOT EXISTS arena_responses (
  id uuid PRIMARY KEY,
  battle_id uuid NOT NULL REFERENCES arena_battles(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('a','b','c','d')),
  engine text NOT NULL CHECK (length(engine) BETWEEN 1 AND 60),
  content text NOT NULL DEFAULT '' CHECK (length(content) <= 60000),
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','failed','not_configured','empty')),
  latency_ms integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  subscores jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  vote text CHECK (vote IN ('a','b','c','d','tie')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (battle_id, side)
);
CREATE INDEX IF NOT EXISTS idx_arena_responses_battle ON arena_responses(battle_id, side);

CREATE TABLE IF NOT EXISTS arena_artifacts (
  id uuid PRIMARY KEY,
  battle_id uuid NOT NULL REFERENCES arena_battles(id) ON DELETE CASCADE,
  engine text NOT NULL CHECK (length(engine) BETWEEN 1 AND 60),
  lang text NOT NULL DEFAULT 'text' CHECK (length(lang) <= 40),
  kind text NOT NULL DEFAULT 'code' CHECK (kind IN ('code','preview','image','diagram','text')),
  code text NOT NULL CHECK (length(code) BETWEEN 1 AND 200000),
  bytes integer NOT NULL DEFAULT 0 CHECK (bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_arena_artifacts_battle ON arena_artifacts(battle_id, created_at ASC);

-- Per-account per-engine record. Ratings live here so a new deployment starts
-- empty instead of inheriting invented numbers.
CREATE TABLE IF NOT EXISTS arena_ratings (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  engine text NOT NULL CHECK (length(engine) BETWEEN 1 AND 60),
  rating integer NOT NULL DEFAULT 1200 CHECK (rating BETWEEN 100 AND 3000),
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  ties integer NOT NULL DEFAULT 0 CHECK (ties >= 0),
  battles integer NOT NULL DEFAULT 0 CHECK (battles >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, engine)
);
