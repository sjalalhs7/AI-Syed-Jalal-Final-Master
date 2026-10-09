# AI-Syed-Jalal — Reconciled Recovery Master

This repository is the documentation/control point for the recovered AI-Syed-Jalal project lineage. The full local recovery ZIP is currently validated in the working session, but has **not yet been attached to a GitHub Release**.

## Locked design rule
The approved Login Page + Homepage + Logo identity, theme language, and hierarchy are locked. Add capabilities without unnecessary redesign. Older concept boards remain historical references, not replacements for the approved design.

## Source lineage
- V122-MERGED is the larger recovered source base: 9,950 files and 282,418,696 bytes uncompressed in its original archive.
- V125-FULL is a smaller curated continuation: 1,226 files and 18,719,357 bytes uncompressed. It is not a complete replacement for V122.
- The recovery master combines the V122 source lineage with selected V125 additions and verified engineering-baseline records.
- The original historical V25 archive remains missing/unverified.

## Main user-facing surfaces in the recovery package
- Public homepage and login entry
- Dashboard and workspace shell
- AI command console and agent catalog
- Google Gemini / AI Studio provider adapter and optional Google Search grounding configuration
- Bounded Supervisor and AutoGPT UI/API contracts
- Skills/catalog, Agency profiles/tools, learning roadmaps and OSSU reference material
- Profile/settings and OpenCode/Android IDE integration contracts

## Verification summary
Offline regression/source gates pass for the V76/V73/V75 lineage, 3,500 skills across 35 domains, 120 catalog roles, 303 Agency profiles, 16 Agency tool targets, bounded Supervisor/AutoGPT logic, roadmap data/page/menu, source audit, upstream references, and palette contract.

Not yet proven as live production: PostgreSQL E2E, real provider calls/fallback, live Google Search grounding, dedicated Wikipedia integration, medical safety E2E, physical browser/device and voice tests, Windows/VPS deployment, and exact V25 lineage recovery. Source presence or UI controls are not proof of live integration.

See:
- `docs/FINALIZATION-STATUS.md`
- `docs/AGENT-CAPABILITY-ROADMAP.md`
- `docs/RELEASE-ASSET-HANDOFF.md`
- `docs/visual-history/` in the full recovery package

## Security
Provider secrets stay server-side. Do not commit API keys or production credentials. Medical features must be educational, source-grounded, and safety-gated. Microphone/camera/screen capabilities must be opt-in, permission-gated, visibly active, and revocable.
