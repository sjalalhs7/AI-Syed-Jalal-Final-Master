# Operations

## Daily checks

- API health/readiness.
- PostgreSQL connectivity and capacity.
- Backup freshness and integrity.
- Recent audit/error activity.
- AI provider/circuit state when live AI is enabled.

## Recovery

Use `scripts/backup.sh`, `scripts/restore.sh`, and `scripts/disaster-recovery-drill.sh` according to the deployment runbook. Test restoration before depending on a backup during an incident.
