# Al-Syed Jalal AI V30 Architecture

Frontend (GitHub Pages/static hosting)
→ API / Identity layer
→ Central records + audit storage
→ Backup / monitoring

## Design rules

- Frontend never stores server secrets.
- Server validates role permissions; UI hiding is not security.
- Record IDs are unique on the server.
- Every mutation creates an audit event.
- GitHub Pages remains the static frontend only.
