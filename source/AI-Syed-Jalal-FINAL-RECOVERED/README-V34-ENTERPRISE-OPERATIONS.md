# Al-Syed Jalal AI V34 — Enterprise Operations

V34 is a complete production-oriented package built from the V33 PostgreSQL baseline.

## Frontend

- Mission Command Center
- Working hash navigation
- Home / Dashboard / Control / Missions / Agents
- Data Vault
- Documents / Print Studio
- Analytics / Audit
- Enterprise Operations Center
- User Management
- Connection settings
- Security settings
- Responsive mobile navigation
- PWA shell and GitHub Pages deployment support

## Backend

- Node.js API + PostgreSQL
- Authentication and sessions
- Role-based access control
- User administration
- Soft delete / restore
- Record history
- Audit/security events
- Backup / restore
- Document registry
- Operational health
- Docker Compose

## Deployment split

GitHub Pages can host the static frontend. The API/database must be deployed separately. GitHub Pages publishes static HTML/CSS/JavaScript and project sites use the repository path, so the frontend keeps project-safe relative paths.

## Production checklist

1. Create a managed PostgreSQL database or secured PostgreSQL server.
2. Set a unique 32+ byte random `AUTH_SECRET`.
3. Set a strong PostgreSQL password.
4. Set `CORS_ORIGIN` to the exact frontend origin.
5. Set a non-default admin password.
6. Deploy API behind HTTPS.
7. Run migrations.
8. Seed the administrator.
9. Configure the frontend API URL.
10. Test login, roles, records, restore and backup before real data is introduced.
11. Add external object storage for real document binaries if required.

## Honest scope

V34 is a deployable architecture package, not a claim that a public server, database, domain, certificates, email service or object-storage bucket has already been provisioned. Those are environment-specific deployment steps.
