# Security handling

## Historical recovery artifacts are not sanitized releases

The original ZIP contains credential-shaped strings in an imported upstream MedicalGPT training dataset. Two distinct values occur across three matches. Their validity was **not tested**, and no values are reproduced here. The later inspected application source has those matches removed, but removing text from Git does not revoke a credential or sanitize old releases, archives, forks or Git history.

If these values were ever usable, the owner must revoke/rotate them at the provider, review usage, and remove or replace affected artifacts through an authorized incident-response process. This audit did not access provider accounts or alter published releases. See `docs/AUDIT-2026-11-01.md` for the affected path and evidence boundary.

## Safe handling

- Verify checksums before extraction; checksums establish integrity, not safety.
- Use `scripts/verify_recovery.py` rather than blindly extracting ZIP entries.
- Do not execute imported upstream code, install its dependencies with lifecycle scripts, or train on imported datasets without a separate review.
- Keep real credentials out of source, logs, screenshots, test fixtures and release assets.
- Report suspected vulnerabilities privately to the repository owner through GitHub's private vulnerability reporting if enabled. Do not include live secrets in a public issue.

## Production requirements

Server-side provider credentials, authenticated and CSRF-protected writes, bounded requests/tools, shared abuse limits, database migrations, backup/restore tests and live provider/browser checks remain deployment responsibilities. A passing source or mock test is not evidence of production security.
