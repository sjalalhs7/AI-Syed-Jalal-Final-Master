# Frontend integration and QA checklist

## Included in this change
- Reworked crowned SJ SVG brand mark at `assets/web-logo.svg` (existing references remain valid).
- Additive responsive utilities in `assets/v101-palette.css`: auto-fit grid, fluid type, aspect ratios, flex wrapping, container queries, smart widths, focus-visible, reduced-motion and mobile spacing.
- Static validation script: `node scripts/validate-static.mjs`.

## Verify before release
1. Run `node scripts/validate-static.mjs` from the frontend directory.
2. Open the preview at 320px, 375px, 768px, 1024px and desktop width; confirm no horizontal overflow and forms remain usable.
3. Verify all navigation, login/register UI, AI widget and theme switches in a real browser.
4. In DevTools, check Console and Network for failed JS/CSS/assets, then test keyboard navigation and reduced-motion preference.
5. Check PWA install prompt, manifest icon paths, service-worker activation and offline fallback. A static source check does not prove offline behavior.
6. Test authentication and API/database behavior against a non-production environment; never use real user credentials in automated tests.
7. Deploy only after the preview passes and inspect the deployed URL again.

## Important scope note
This static script checks file presence and key markup hooks. It is not an end-to-end browser test and does not prove the backend, database, provider APIs, login, or offline cache work. External services (Stitch, Antigravity, Mixboard, Gemini Notebook, Open Highfield, Pomilli, and the two dpdns.org hosts) should only be integrated through verified links or documented APIs; they are not automatically installed by naming them.
