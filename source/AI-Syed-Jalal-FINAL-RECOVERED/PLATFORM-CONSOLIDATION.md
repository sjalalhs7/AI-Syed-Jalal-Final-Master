# Platform consolidation ledger

Canonical application: `source/AI-Syed-Jalal-FINAL-RECOVERED` on `main`.

## Already consolidated into `main`

- PR #13 (squash-merged 2026-11-02, commit `993184e7deb5dc7e5687f3e0cd085defb77a69eb`) brought the recovered application, security hardening, assistant tools, voice integration, mobile/cloud chat, privacy controls, library catalog, tests, CI, guide and final verification into `main`.
- Historical feature PRs #3–#11 were merged into `recovery/data-upgrade-2026-10-22`; their usable application content was restored and hardened through PR #13.
- Security PR #12 content (atomic rate limits, body-size alignment, migration 005) is present in `main` and was further extended by migrations 006 and 007.
- PR #14 (squash-merged 2026-11-02, commit `1f3a31546226cc7dd03f1d118f5acb40537d73a8`) added the unified SJ Agent Studio, platform API, migration 007, tests and entry-point links.

## Historical branches / PRs not blindly re-merged

The following remain as historical recovery references. Re-merging them wholesale would reintroduce obsolete workflows, duplicate source trees, or pre-hardening code. The canonical platform is `main`; new work should branch from `main` and merge back through a reviewed PR.

| Reference | Status | Reason |
| --- | --- | --- |
| PR #1 `recovery/extracted-source-2026-10-11` | Closed as superseded | Early extracted source; superseded by recovered + hardened app in `main`. |
| PR #2 `recovery/data-upgrade-2026-10-22` | Closed as superseded | Recovery integration branch; usable content consolidated via PR #13. |
| PR #12 `fix/security-hardening-2026-11-01` | Closed as superseded | Security changes are in `main`; readiness now requires 13 tables. |
| `arena/342bece0-ai-syed-jalal-final-master` | Merged | Source branch for PR #13; retained for audit trail. |
| `arena/85404700-ai-syed-jalal-final-master` | Merged | Source branch for PR #14; retained for audit trail. |

## Unified platform entry points

- `agent.html` — SJ Agent Studio: Direct / Agent / Compare, history, files, voice, export.
- `jalalai.html` — focused assistant with tasks/notes and voice.
- `workspace.html` — data vault, documents, approvals, admin, operations, AI command.
- `dashboard.html` — command center and library.
- `guide.html` — quick start and honest capability status.

## Rule going forward

1. Branch from `main`.
2. Keep one canonical app folder: `source/AI-Syed-Jalal-FINAL-RECOVERED`.
3. Run `npm run check`, `npm test`, `npm run test:e2e` from that folder.
4. Merge reviewed PRs into `main`; do not create parallel long-lived app forks.
5. Label credential-gated features honestly; never fake provider, voice, or external-action success.
