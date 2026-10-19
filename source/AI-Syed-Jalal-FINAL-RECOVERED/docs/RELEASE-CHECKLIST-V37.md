# V37 Release Checklist

- [ ] CI workflow passes on the main branch.
- [ ] GitHub Pages environment is configured.
- [ ] Production `CORS_ORIGIN` is the exact frontend origin.
- [ ] `DATABASE_URL` is stored as an environment secret.
- [ ] `SESSION_TTL_HOURS` is explicitly set.
- [ ] PostgreSQL backup job is scheduled outside the application container.
- [ ] API `/api/health` returns 200.
- [ ] API `/api/ready` returns 200 with PostgreSQL online.
- [ ] `npm run smoke` passes against the production API.
- [ ] Login, CRUD, import/export, backup/restore, print/document workflows are tested on a PC.
- [ ] At least one restore drill has been completed on a non-production database.
- [ ] Browser console has no blocking JavaScript errors.
