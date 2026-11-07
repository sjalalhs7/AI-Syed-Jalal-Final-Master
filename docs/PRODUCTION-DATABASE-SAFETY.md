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

## Optional single-database archive for an experienced operator

The repository's `scripts/backup.sh` now creates an archive of **one** database,
not a full recovery solution. Its interface changed: it no longer accepts a
`DATABASE_URL` on the `pg_dump` command line or defaults to a folder in the
repository. The earlier drill scripts now call this same archive helper; their
names do **not** mean a restore drill was performed. The old `scripts/restore.sh`
is disabled because it used `--clean` against `DATABASE_URL` and could destroy
objects in a mistakenly selected database. Disabling it does not prevent an
owner from using an independently approved recovery procedure.

1. On an authorized operator's machine, identify the **actual** production
   project, branch and database; arrange backup access with sufficient read
   privileges for all in-scope data. Install Git for the working-tree safety
   check, and use PostgreSQL `pg_dump` and `pg_restore` versions compatible with
   the server. For Neon, use the **direct, unpooled**
   host and a verified TLS configuration as described in the Neon guides below.
2. Configure a named PostgreSQL service (`PGSERVICE`, optionally
   `PGSERVICEFILE`) for that database and a protected `.pgpass`/`PGPASSFILE`.
   Keep both files and passwords outside the repository, restrict access (for
   example, mode 600 on Unix), and never post them in chat. Inspect the service
   definition carefully: the helper cannot determine whether it names the right
   project, branch or database. Set the host, database, user and required TLS
   parameters explicitly; do not rely on inherited defaults.
3. Create an existing private directory **outside all Git working trees**, on
   approved encrypted storage. From the recovered application directory, run:

   ```sh
   PGSERVICE=your_configured_service bash scripts/backup.sh /path/to/private-backups
   ```

   This uses the local service configuration, not a connection string in the
   command arguments. The script creates a new 700 directory and a 600
   `database.dump`, and lists the archive. **The archive is not encrypted by the
   script**; protect the storage and any copies. The dump may contain private
   records, password hashes and stored provider keys. Failed/partial outputs are
   removed where possible, but a crash or power loss can leave a partial file.
   Git ignore rules are a secondary safeguard, not a secure backup location.
4. Listing an archive is **not** an actual restore or a completeness test. Use
   the owner's approved process to restore into a clearly identified isolated
   target, inspect schemas, grants and representative data, and rehearse the
   actual repair path there before any production change. Recreate roles and
   permissions as appropriate for the test target; never use `--clean` on the
   live database. Stop if the target or results are uncertain.

`pg_dump` covers only the connected database. Other databases, cluster-wide role
and tablespace definitions, external files, secrets outside the database and
other infrastructure need separate recovery coverage. Sufficient source privileges
and compatible restore permissions are essential. Old archives produced with
`--no-acl` omitted access privileges; do not assume they contain grants. A
verified isolated restore must include an owner-reviewed plan for these gaps.
Backup/rehearsal may contain real personal data; protect it and delete temporary
copies according to the owner's policy.

## Legacy deployment and migration paths

The optional self-hosted `deployment/online/docker-compose.production.yml` no
longer runs migrations on container startup, and its `deploy.sh` no longer seeds
an Admin. First-time deployments will need separately authorized initialization;
an incomplete schema can leave the API unhealthy and prevent the web container
from starting. See its README before using it. This repository change does not
change the running Cloudflare deployment or the website/app's shared backend.

The Node `db:migrate` command is a separate, explicit database write; it does
**not** verify a backup, target identity or approval for you. It runs within a
transaction and tracks `schema_migrations`, unlike the Cloudflare repair route's
individual statements. Rehearse the exact path you intend to use. The legacy
local `backend/docker-compose.yml` and `deploy` setup scripts may automatically
migrate or seed the database they are configured to use; do not point them at the
shared production database or run them against it without the same safeguards.

## When the owner approves repair

An authenticated Admin may use **Workspace → Operations → Database Schema →
Repair schema** after the above checks. The site asks for confirmation and sends
the session CSRF token. The server checks the Admin role, CSRF token and
explicit confirmation. The repair runs SQL statements individually through the
HTTP database adapter: if one fails, earlier changes can remain committed and
later parts may still be attempted. The bundle also alters constraints and may
insert a bootstrap row. Its limited destructive-statement check is not a backup,
a transaction, or a guarantee that production data is safe.

If a repair reports any failed migrations, an error or an uncertain outcome,
stop and review it with the database owner; do not blindly retry or overwrite
production. A browser timeout only stops waiting; it does not establish that the
server-side operation stopped. Workspace keeps a review warning and hides the
repair button for the current page after such a result, but this is not a
permanent lock: a page reload clears it and the API does not verify backup or
rehearsal claims. Review the database before considering another attempt.
After an approved successful operation, check `/api/ready` and the Admin
Diagnostics count, then independently inspect migrations, columns and indexes
and exercise affected features with approved safe test data. **24 of 24 table
names is not a complete health or data-integrity test.**

References: Neon [manage branches](https://neon.com/docs/manage/branches),
[testing queries on a branch](https://neon.com/docs/guides/branching-test-queries),
[backups with pg_dump](https://neon.com/docs/manage/backup-pg-dump),
[secure connections](https://neon.com/docs/connect/connect-securely), and
[instant restore and its overwrite behavior](https://neon.com/docs/introduction/branch-restore);
PostgreSQL [service files](https://www.postgresql.org/docs/current/libpq-pgservice.html),
[password files](https://www.postgresql.org/docs/current/libpq-pgpass.html),
and [SQL dump limits](https://www.postgresql.org/docs/current/backup-dump.html).
