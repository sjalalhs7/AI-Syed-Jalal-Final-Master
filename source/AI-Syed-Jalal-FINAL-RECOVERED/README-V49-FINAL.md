# AI-Syed Jalal — V49 Professional Engineering Final

V49 is the final engineering-packaging release built on V48 Professional Hardening. It adds mature repository hygiene, security/contributor documentation, categorized test structure, consolidated CI/CD workflows, and an explicit final-release checklist.

## What is included

- Frontend application in `frontend/`
- Node.js/PostgreSQL backend in `backend/`
- AI runtime and specialist/skill registries
- Data, audit, import/export and document workflows from the previous release line
- Security and operations scripts
- Engineering documentation under `docs/`
- Regression and release tests under `tests/`
- GitHub Actions workflows under `.github/workflows/`

## Important truth about “final”

This package is final as a code/repository release, but no software package can honestly prove a customer's live infrastructure without running against that infrastructure. PostgreSQL availability, real AI provider credentials, HTTPS certificates, network topology, browsers, and physical printers must be acceptance-tested in the deployment environment.

## Start locally

See `backend/README.md` and `docs/deployment/README.md`. Node.js 20+ and PostgreSQL are required for the backend.

## Security

Read `SECURITY.md` before deployment. Never commit production credentials or customer data.
