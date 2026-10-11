# Security Policy

## Supported release

V49 is the current professional hardening release. Security fixes should target the current release line unless a deployment requires an emergency backport.

## Reporting a vulnerability

Do not publish credentials, database dumps, session cookies, personal data, or exploit details in a public issue. Report privately to the project maintainer through the project's configured private security channel.

Include:
- affected component and version;
- deployment context (Pages, self-hosted backend, or other);
- reproducible steps;
- expected and observed behavior;
- impact assessment;
- a safe proof of concept where possible.

## Operational requirements

- Use HTTPS in production.
- Keep `DATABASE_URL`, provider API keys, and session secrets outside source control.
- Configure an explicit `CORS_ORIGIN`; do not rely on permissive defaults.
- Use PostgreSQL TLS verification when the deployment requires TLS.
- Rotate credentials after suspected exposure.
- Review backups before restoring them into production.

This document describes project practice; it is not a guarantee that a deployment is secure without environment-specific review.
