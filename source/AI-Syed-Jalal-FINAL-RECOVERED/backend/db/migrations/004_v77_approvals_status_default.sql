-- Keep the existing approvals table aligned with the application schema.
ALTER TABLE approvals ALTER COLUMN status SET DEFAULT 'pending';
