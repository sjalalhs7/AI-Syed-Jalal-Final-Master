# AI-Syed Jalal V26 PRO — Production Level-Up

This package hardens the V26 Level-Up build for a real PC-first data workflow while keeping the V25 baseline separate.

## Added
- Real editor modal instead of browser prompts
- Edit + delete controls
- Safe HTML escaping for table data
- 100-row pagination to keep rendering responsive
- Robust CSV parser with quoted-field support
- JSON + CSV export
- Full JSON backup export
- Import validation and field normalization
- IndexedDB indexes for updated/region/sector
- Working dark/light theme persistence
- GitHub Pages-safe static deployment workflow
- Existing A4 print controls retained

## Important
This is still a static-browser application. IndexedDB is local to each browser/device; it is not a central multi-user database. For true shared office data, authentication, concurrent users and server-side storage, a backend/API is required.

## Deployment
GitHub Pages project sites are served under the repository path, so project-safe relative assets/navigation are used. GitHub recommends GitHub Actions for automated Pages deployment.
