# Al-Syed Jalal AI V31 — Live Production Integration

V31 connects the Mission Command Center frontend to a real Node.js API when an API URL is supplied at login.

## Included

- Full V30 Mission Command Center frontend
- Live server login and role claims
- Central records API with pagination and filters
- Create / update / delete permissions
- Server audit trail
- Central backup endpoint
- Health and metadata endpoints
- CORS controls and security headers
- Login attempt throttling
- Dockerfile and environment template
- GitHub Pages-compatible frontend
- Local demo fallback when no API URL is supplied

## Honest scope

The backend is a **file-backed starter**, not a final enterprise database. It is suitable for a controlled prototype/small deployment, but PostgreSQL or another managed database should be used for a serious multi-user office deployment.

Do not publish the default administrator password or leave the default `AUTH_SECRET` in production.
