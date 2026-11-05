-- V149: first-run bootstrap and admin-managed provider settings.
-- Additive only, safe to replay.

-- Key/value store for deployment-level settings the owner can change without
-- redeploying: which AI providers are enabled, and when each key was set.
-- Secrets are stored encrypted-at-rest by Neon; this table never leaves the server.
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 120),
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT ''
);

-- A one-row guard so "create the first Administrator" can only ever happen when
-- the deployment has no users at all. Without this, a live database nobody can
-- administer has no recovery path: registration always creates a Viewer, and
-- every admin-only route (including schema repair) is therefore unreachable.
CREATE TABLE IF NOT EXISTS app_bootstrap (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  completed_at timestamptz,
  completed_by text NOT NULL DEFAULT ''
);
INSERT INTO app_bootstrap (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
