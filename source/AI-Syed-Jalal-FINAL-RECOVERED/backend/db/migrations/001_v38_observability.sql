ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS request_id text;
CREATE INDEX IF NOT EXISTS idx_audit_request_id ON audit_events(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_records_region_sector ON records(region,sector);
CREATE INDEX IF NOT EXISTS idx_records_active_updated ON records(updated_at DESC) WHERE deleted_at IS NULL;
