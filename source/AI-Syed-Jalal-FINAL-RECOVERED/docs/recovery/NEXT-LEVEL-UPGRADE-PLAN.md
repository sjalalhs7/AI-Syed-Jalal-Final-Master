# Next-Level Upgrade Plan — AI-Syed-Jalal

## Objective
Improve project data quality, recovery traceability, and release reliability while preserving the existing recovered source and approved design history.

## Workstream 1 — source and data integrity
1. Pin the working branch and commit SHA before each change.
2. Generate separate manifests for V122 and V125.
3. Compare file paths and SHA-256 hashes; classify files as identical, added, removed, or changed.
4. Create a conflict register for critical UI, login, dashboard, assets, and integration files.
5. Never bulk-copy one archive over the other.

**Deliverable:** versioned source manifest, diff report, and explicit conflict decisions.

## Workstream 2 — visual reference data
1. Treat approved Homepage, Login, and Logo as locked references.
2. Map each of the eight approved Library images to a reference ID, intended component, and candidate source asset.
3. Keep an image mapping row unresolved until a real asset path and visual comparison exist.
4. Compare the actual frontend to each reference before adjusting CSS.
5. Verify Glassmorphism, Watermorphism, Firemorphism, and Rainbowmorphism independently.

**Deliverable:** visual asset map plus screenshot-based QA report.

## Workstream 3 — functional data and integrations
1. Trace the login request to its real API base URL.
2. Identify the deployed backend/runtime, if any, and verify database/persistence configuration without exposing secrets.
3. Test valid and invalid login, session lifecycle, authorization, dashboard loading, and logout.
4. Verify real AI/provider and fallback requests; capture success and failure behavior.
5. Verify each advertised agent/tool action returns a real result.

**Deliverable:** integration inventory with VERIFIED / NOT VERIFIED / BLOCKED status and evidence.

## Workstream 4 — code quality and security
1. Inspect all 28 currently listed frontend entries and nested asset folders before edits.
2. Check broken references, console errors, mobile layout, keyboard access, contrast, and form errors.
3. Search client-visible files for accidentally exposed credentials; rotate any exposed secret rather than merely deleting it from the latest file.
4. Add tests only after identifying the actual stack and available scripts; do not invent a build command.
5. Keep changes small, reviewable, and isolated on a recovery branch.

**Deliverable:** focused code diff and reproducible test report.

## Workstream 5 — release
1. Commit the source/data update on an isolated branch.
2. Validate the exact commit and review its diff.
3. Deploy a preview, not production.
4. Run the verification matrix and record evidence.
5. Promote only after blockers pass; then smoke-test the production URL and record rollback information.

## Immediate sequence
- [ ] Inventory actual frontend files and nested assets.
- [ ] Read existing finalization status, visual definition, and recovery audit.
- [ ] Build V122/V125 path/hash manifests.
- [ ] Map approved image references without asking for re-upload first.
- [ ] Trace actual login/API/dashboard wiring.
- [ ] Fix one verified high-priority issue at a time.
