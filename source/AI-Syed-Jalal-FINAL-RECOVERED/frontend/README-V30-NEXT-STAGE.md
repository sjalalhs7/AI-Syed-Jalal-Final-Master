# Al-Syed Jalal AI — V30 Next Stage

V30 is the next production-architecture stage after V28. It keeps the working V28 application shell and adds a control layer plus a backend-connection contract.

## New in V30
- Control Center for work queues, approvals, system state and next actions
- Connection & Security workspace
- API base URL + tenant configuration stored locally
- Endpoint reachability test (subject to HTTPS/CORS)
- Local operator roles: Admin, Manager, Data Operator, Viewer
- Browser hash/history navigation so navigation survives refresh and Back/Forward
- V30 service-worker cache version
- Existing V28 Data Vault, audit, import/export, backup, documents/print, login shell and responsive navigation retained

## Important truth
V30 does **not** create a real server, central database, or secure authentication by itself. The API URL and roles are configuration/UI contracts. Real multi-PC synchronization requires a backend API, database, identity provider, server-side authorization and audit controls.

## Recommended production architecture
Browser frontend (GitHub Pages) → Identity Provider → API → Database → Audit/Backup services.

GitHub Pages remains the static frontend; GitHub documents GitHub Pages as static hosting and supports GitHub Actions for automated deployment.
