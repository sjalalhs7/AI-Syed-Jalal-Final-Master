# Production database safety and repair handoff

Updated 7 November 2026. **Status: not repaired.** The live `/api/ready`
endpoint reports 13 of 24 required table names present. That response does not
establish why tables are missing, whether columns and indexes are correct, or
whether any data is complete. The website and Android app continue to use the
same production origin and backend.

## Before any production migration

1. The owner should identify the Neon project, production branch and database
   actually used by the live site. Do not paste connection strings, passwords,
   tokens, private records or backups into chat or the repository.
2. Make a **full, protected and restorable backup of all databases and data in
   scope**, using the owner's chosen Neon/SQL backup process. Check the plan's
   history/backup retention and whether an independent, encrypted backup is
   required. A recovery branch or retained point-in-time history may be useful,
   but is not automatically an independent off-provider backup. Console-created
   Neon branches can have automatic expiration; check it explicitly.
3. Verify recovery **into an isolated non-production target**: check that it is
   the expected database and compare table/schema inventory and representative
   counts and data for accounts, records (including deleted rows), documents,
   sessions, notes, audit history and other relevant tables. A successful
   download or checksum alone is not a restore test. Keep private data protected.
   A test clone is only a temporary safety copy; do not redirect the website or
   app to it or split their shared production data.
4. Rehearse the actual migration on an isolated clone of the live schema with
   the owner's approval. Review failures, constraints, indexes and expected
   data before and after. Local PGlite tests do not prove the live Neon schema
   is identical or that a migration will succeed there.
5. Agree a maintenance window and recovery plan. Neon point-in-time restore
   overwrites the target branch's data and schema; it is **not a merge** and can
   lose changes made since the chosen time. Do not restore or migrate the live
   branch without the owner's specific approval and a verified recovery plan.

The Workspace **Records Backup** button exports *active records only*. It does
not back up users, deleted records, documents, audit history, notes, sessions or
other tables. Its SHA-256 describes that downloaded file; it is not proof of a
complete database backup or a successful restore.

## When the owner approves repair

An authenticated Admin may use **Workspace → Operations → Database Schema →
Repair schema** after the above checks. The site asks for confirmation and sends
the session CSRF token. The server checks the Admin role, CSRF token and
explicit confirmation. The repair runs SQL statements individually through the
HTTP database adapter: if one fails, earlier changes can remain committed and
later parts may still be attempted. The bundle also alters constraints and may
insert a bootstrap row. Its limited destructive-statement check is not a backup,
a transaction, or a guarantee that production data is safe.

If a repair reports any failed migrations or an unexpected state, stop and
review it with the database owner; do not blindly retry or overwrite production.
After an approved successful operation, check `/api/ready` and the Admin
Diagnostics count, then independently inspect migrations, columns and indexes
and exercise affected features with approved safe test data. **24 of 24 table
names is not a complete health or data-integrity test.**

Neon references: [manage branches](https://neon.com/docs/manage/branches),
[testing queries on a branch](https://neon.com/docs/guides/branching-test-queries),
and [instant restore and its overwrite behavior](https://neon.com/docs/introduction/branch-restore).
