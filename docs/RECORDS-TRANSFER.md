# Records transfer and safety

This describes the behavior in this source revision. A deployment must be verified separately. It is **not** a full database backup or a production data-recovery procedure; see [Production database safety](PRODUCTION-DATABASE-SAFETY.md).

## Data Vault import and export

- JSON exports preserve the values returned by the records API. The paginated export is capped at 20,000 records. It checks for inconsistent counts and duplicate IDs but is **not a point-in-time snapshot**; concurrent changes can still affect the result.
- CSV supports quoted commas, double quotes, and embedded CR/LF. CSV exports prefix formula-like cells with an apostrophe to reduce spreadsheet formula-injection risk; this changes those values and is not guaranteed safe in every spreadsheet. Use JSON rather than CSV when exact values matter, and handle untrusted files cautiously.
- Import accepts UTF-8 JSON/CSV up to 20 MiB. It validates every input and duplicate ID before writing, rejects malformed/overlong fields rather than truncating, and imports only `id`, `name`, `region`, `sector`, `status` and `notes`. Timestamps, accounts, documents, deleted rows and audit history are not restored.
- Central imports ask for confirmation: matching **active** IDs are overwritten, while matching soft-deleted IDs remain deleted and are counted as skipped. The server enforces this even for direct API clients. Generated IDs use full UUIDs.
- Imports split into bounded requests of up to 5,000 records and below the 1 MiB API body limit. Each database upsert is one statement, but **there is no transaction across batches**. If a response is lost or the page closes, a batch may have committed. The UI stops and reports the uncertain result instead of retrying; inspect the data before retrying.
- The UI displays central records as unavailable if their API request fails; it does not present local records as a substitute.

## Admin records merge

The Admin-only **Merge Records Backup** consumes the application's version 1 active-record export. It overwrites matching active IDs. Deleted IDs are skipped by default; the Admin must explicitly select and confirm reactivation of matching deleted IDs. Successful reactivation clears both deletion fields. The API requires `restoreDeleted: true` and `confirm: "restore-deleted-records"` for that exceptional path. A crafted backup file cannot select the checkbox in the UI.

File validation, bounded batches, progress and uncertain-response handling follow the same rules as import. An active-record export can be larger than the UI's 20 MiB merge limit or contain legacy values that fail the current validation. The UI warns about these cases but still downloads the records for investigation; use a separate approved approach. It rejects malformed export responses rather than downloading them as backups. This merge does **not** restore unrelated database tables, accounts, sessions, documents, histories, permissions or external resources, and does not prove a backup is restorable. It can overwrite current values and must not be used as a substitute for a verified full backup and isolated rehearsal.

API compatibility: `/api/records/bulk` now rejects an invalid batch instead of silently skipping or truncating invalid values, and reports soft-deleted IDs as skipped. `/api/restore` requires the exported `version: 1`, skips deleted IDs by default, and requires the explicit two-field opt-in above to reactivate them. Existing automation relying on the old behavior must be reviewed before upgrading.

## Individual record editing

Single-record create and update now validate field types and length limits rather than silently truncating or accepting blank names. On update, omitted or `null` fields remain unchanged. Auto-generated IDs use a full UUID. The editor preserves existing custom or empty statuses and sends only visibly changed fields, so untouched central values—including CRLF line endings—are not replaced. Local edits patch the current record in one IndexedDB transaction. A field that is actually edited uses the browser's input value, which may normalize line endings.

Central single-record edits also pass the short-lived PostgreSQL row version obtained when opening the form. The UPDATE compares it in the same SQL statement; if the record changed, the tested API returns a conflict without applying the edit. The editor keeps the form open so the user can retain their input, then close and reopen to review the current record. A missing or invalid version prevents this editor from submitting an update. The token is based on PostgreSQL `xmin`; it is not a durable, globally unique revision or an audit history, and restore/maintenance and transaction-ID reuse are outside its guarantees.

On the tested schema, create, update and soft-delete each write the record and its `record_history` snapshot in one PostgreSQL statement. A history-write error aborts that statement; the separate audit event remains best-effort. This is not a full audit, backup or rollback guarantee, and production schema/trigger behavior must be verified independently. If a response is lost, the UI warns that a save or deletion might already have happened and does not retry it automatically.

**Compatibility:** individual create and update now reject invalid or overlong values rather than accepting, coercing objects, or truncating them. Existing clients relying on those behaviors need review. Changing an overlong legacy field requires a separate approved correction, not silent truncation; whether other fields can be edited depends on browser and server validation.

## Remaining limitations

- An authorized writer can still overwrite active records by ID after transfer confirmation; bulk imports and restores have no atomic preview/version conflict check. The optional single-record version check is used by the current central editor, but older API clients can omit it; deletes and other write paths do not use it. Local edits merge untouched fields transactionally but do not detect two tabs changing the same field.
- Existing `BULK_IMPORT` and `BACKUP_RESTORE` audit events are best-effort and do not constitute a per-record change history or rollback. Audit-write failures are deliberately not treated as proof that the record operation failed.
- Validation and one SQL statement protect each request, not an entire multi-request transfer. Database, network, permissions, backup and recovery status remain deployment-specific.
- The Admin `/api/backup` endpoint returns all active records in one response; large datasets can exceed runtime, network or browser limits. A downloaded file and its optional checksum do not prove a complete or restorable database backup.
- Local PGlite and browser tests use synthetic data only and cannot establish the contents, schema identity, integrity, or backup status of the live Neon database.

## Regression checks

From `source/AI-Syed-Jalal-FINAL-RECOVERED`:

```sh
node --test frontend/tests/records-transfer.test.mjs
node --test --test-concurrency=1 server/tests/records-transfer-safety.test.mjs
npm run test:e2e -- tests/browser/data-transfer.spec.mjs tests/browser/data-transfer-race.spec.mjs
```
