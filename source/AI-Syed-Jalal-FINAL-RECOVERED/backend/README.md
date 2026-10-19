## V35 Backend

Enterprise API for Al-Syed Jalal AI. Includes PostgreSQL records, sessions, roles, audit, backup/restore and admin operations.

# Al-Syed Jalal AI V35 Enterprise Operations Backend

V35 adds the enterprise operations layer on top of the V32/V33 PostgreSQL API.

## Included

- PostgreSQL central records
- Real login and sessions
- Admin / Manager / Data Operator / Viewer roles
- User management
- Role/permission matrix endpoint
- Soft delete + restore for records
- Record version/history snapshots
- Central audit + security events
- Enterprise backup and transactional restore
- Document metadata registry
- Admin session visibility
- Health endpoint
- Docker deployment foundation

## Run

```bash
cp .env.example .env
# set DATABASE_URL, CORS_ORIGIN and a long random AUTH_SECRET
npm install
npm run migrate
npm run seed
npm start
```

Never use the example credentials or placeholder secrets in a public deployment.

## Key endpoints

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/change-password`
- `POST /api/auth/logout`
- `GET /api/auth/sessions`
- `DELETE /api/auth/sessions`
- `GET /api/records`
- `POST /api/records`
- `PUT /api/records/:id`
- `DELETE /api/records/:id` — soft delete
- `POST /api/records/:id/restore`
- `GET /api/records/:id/history`
- `GET /api/audit`
- `GET /api/security/events`
- `GET /api/backup` — Admin only
- `POST /api/restore` — Admin only
- `GET/POST /api/admin/users` — Admin only
- `PATCH /api/admin/users/:id` — Admin only
- `GET /api/admin/sessions` — Admin only
- `GET/POST /api/documents`
- `GET /api/permissions`

The document registry stores metadata/storage keys; actual binary document storage should be connected to an object-storage service or private server volume for production.
