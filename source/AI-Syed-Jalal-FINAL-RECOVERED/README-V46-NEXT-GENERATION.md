# Al-Syed Jalal AI — V46 Next Generation

V46 advances the V45 production baseline with a next-generation resilience layer while preserving the existing homepage, login, logo, data workflows, printing controls, AI runtime, authentication, audit, backup/restore and PostgreSQL architecture.

## V46 upgrades
- Admin diagnostics endpoint: `/api/admin/diagnostics`
- Database + required-schema validation
- AI runtime and concurrency visibility
- Connection-pool health snapshot
- Backup SHA-256 integrity manifest from the Operations Center
- V46 release metadata across live UI/API surfaces
- Preserved V45 AI command-control architecture and provider circuit protection

## Verification
Run:

```bash
node --check backend/server.mjs
node --check backend/ai-runtime-v46.mjs
node tests/v46-next-generation.mjs
node tests/ai-command-control.mjs
node tests/lineage-audit.mjs
node tests/print-regression.mjs
node tests/quality-gate.mjs
```

A live PostgreSQL/Node deployment still requires `npm install`, PostgreSQL, environment variables, migrations/seed data, HTTPS and real provider credentials.
