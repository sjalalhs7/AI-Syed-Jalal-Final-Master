# Al-Syed Jalal AI — V28 Complete Setup

V28 is a complete single-page application shell designed for GitHub Pages with working client-side navigation and local IndexedDB data tools.

## Included
- Login / session gate (client-side demo only)
- Branded application logo and favicon
- Responsive desktop sidebar + mobile bottom navigation
- Home, Dashboard, Mission Studio, AI Agents, Data Vault, Documents, Analytics, Audit & Health, Settings
- Working navigation buttons between views
- Data add/edit/delete/search/filter/pagination
- JSON/CSV import and export
- Full local backup
- Audit trail
- Police Verification print studio
- Dark/light theme
- PWA manifest + service worker foundation
- GitHub Pages Actions workflow
- 404 fallback

## Important architecture note
This package is static/client-side. GitHub Pages hosts static HTML/CSS/JavaScript. The login is a demo session gate, not secure authentication, and IndexedDB is local to the browser/device. For true multi-PC shared operation, add a backend/API, central database and identity provider.

## GitHub Pages
Set repository Settings → Pages → Source: GitHub Actions. Push the package to the repository's main branch. GitHub's current documentation recommends Actions for automated Pages deployment and project sites are served under `/<repository>`.
