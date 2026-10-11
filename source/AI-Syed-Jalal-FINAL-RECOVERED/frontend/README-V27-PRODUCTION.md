# AI-Syed Jalal V27 — Production Level-Up

V27 is a hardened static-browser evolution of V26 PRO. It adds a local audit trail, safer large imports, duplicate-ID protection, recovery backups containing data + audit history, system-health distribution, offline shell caching, PWA metadata, and a GitHub Pages-friendly 404 recovery page.

## Important architecture boundary
GitHub Pages hosts static HTML/CSS/JS. V27 therefore does **not** claim to provide a central multi-PC database, server authentication, or real cross-device synchronization. IndexedDB is local to the browser/device.

## Recommended next architecture
For true multi-PC office operation: add a server/API and central database, then connect V27 through a versioned data service layer.

## GitHub Pages
Use GitHub Actions or a branch publishing source. Project sites are served under the repository path; keep internal links relative/project-safe.
