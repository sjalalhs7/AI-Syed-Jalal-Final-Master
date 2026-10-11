# V40 Performance & Disaster Recovery Runbook

## Targets
- 10,000 records: baseline acceptance
- 50,000 records: heavy operational dataset
- 100,000 records: stress dataset
- Import in batches rather than one browser transaction.
- Data Vault renders at most 100 rows per page.

## Database measurement
Run `ANALYZE records` after major data changes and inspect `EXPLAIN (ANALYZE, BUFFERS)` for the main Data Vault queries. PostgreSQL documents ANALYZE for planner statistics and EXPLAIN ANALYZE for actual execution timing.

## Disaster recovery
1. Create a native PostgreSQL dump with `scripts/backup.sh`.
2. Destroy the test database.
3. Recreate it and run migrations.
4. Restore with `scripts/restore.sh`.
5. Run the recovery verification script.
6. Record restored row counts and application health.
