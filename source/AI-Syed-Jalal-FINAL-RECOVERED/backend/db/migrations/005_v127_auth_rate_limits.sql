-- V127: persistent atomic token-bucket state for authentication and AI request limits.
-- The application hashes subjects before storing them; raw IP addresses are never persisted here.
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  scope text NOT NULL,
  subject_hash text NOT NULL,
  tokens numeric(12,6) NOT NULL CHECK (tokens >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_request_id uuid NOT NULL,
  PRIMARY KEY (scope, subject_hash)
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated_at ON auth_rate_limits(updated_at);
