# AI-Syed Jalal AI V38 — Reliability & Production Quality Gate

V38 is the next engineering stage after V37. It focuses on repeatable verification rather than adding cosmetic features.

## V38 additions

- Repeatable static quality gate
- API health/readiness smoke tests in CI
- Request-ID correlation and response timing retained
- Request-ID persisted with audit events
- API version endpoint
- Admin pool/runtime health detail endpoint
- Database migration journal (`schema_migrations`)
- Repeatable V38 database migration
- Composite/partial indexes for region/sector and active records
- Browser end-to-end navigation test using Playwright
- Lightweight API load smoke test
- V38 protected GitHub Pages deployment workflow
- Deployment and quality-gate documentation

## Architecture

Browser / GitHub Pages → API → PostgreSQL

The frontend remains static and can use local IndexedDB when no API is configured. The central API remains a separate production service.

## Honesty boundary

This package is source and deployment configuration. It is not proof that an external API, PostgreSQL server, domain, DNS record, GitHub repository or hosting account has been deployed.
