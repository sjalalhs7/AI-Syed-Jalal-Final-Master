# Al-Syed Jalal AI V33 — Security & Operations

V33 is the security/operations layer over the V32 Enterprise Data Core.

## Added
- Hardened HTTP security headers and Permissions-Policy
- Password change endpoint with minimum 10-character new password
- Revocation of other sessions after password change
- List/revoke-other-sessions API
- Central audit events for security actions
- V33 branding and security controls in Settings
- Existing PostgreSQL/API/Docker architecture retained

## Deployment truth
GitHub Pages hosts the static frontend; the API and PostgreSQL database must be deployed separately. Never put database credentials or server secrets in the frontend repository.
