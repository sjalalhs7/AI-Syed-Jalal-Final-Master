# AI-Syed-Jalal — Critical Verification Matrix

This matrix is evidence-driven. A check is not PASS until a result, timestamp, and relevant commit/deployment are recorded.

| Area | Required evidence | Current state | Release severity |
|---|---|---|---|
| Source lineage | branch + commit SHA + archive manifest | Partial; source branch identified | Blocker |
| V122/V125 reconciliation | path/hash diff and conflict decisions | Audit reports major differences; full reconciliation pending | Blocker |
| Homepage | side-by-side approved reference comparison | Not re-verified against exact reference | Blocker |
| Login visual | approved reference comparison | Not re-verified against exact reference | Blocker |
| Login functional | valid/invalid credentials, session, logout, network evidence | Pending | Blocker |
| Logo/app icon | exact asset path and visual comparison | Asset wiring commit exists; final reference match pending | Blocker |
| 8 approved images | each Library reference mapped to asset path/component | Not yet fully mapped | Blocker |
| Glassmorphism | screenshots + mode-switch test + contrast check | Pending | Major |
| Watermorphism | screenshots + mode-switch test + contrast check | Pending | Major |
| Firemorphism | screenshots + mode-switch test + contrast check | Pending | Major |
| Rainbowmorphism | screenshots + mode-switch test + contrast check | Pending | Major |
| API | actual base URL, request/response, error states | Not verified | Blocker |
| Backend/database | service/runtime and persistence test | Not verified | Blocker for data-backed claims |
| AI/provider fallback | real successful request and provider failure test | Not verified | Blocker for AI functionality claims |
| Agent tools | safe test action with real result | Not verified | Major |
| Responsive | mobile/tablet/desktop captures | Pending | Major |
| Accessibility | keyboard, focus, labels, contrast, form errors | Pending | Major |
| Browser console | no critical runtime errors; network failures explained | Pending | Major |
| Security | no client secrets; auth/CORS/HTTPS reviewed | Pending | Blocker |
| Preview | preview URL, test report, reviewer sign-off | Pending | Blocker |
| Production | direct live-site smoke test after deployment | Deployment success recorded, rendered behavior not fully verified | Blocker |

## Evidence record template

For every row, record:
- Result: PASS / FAIL / BLOCKED / NOT APPLICABLE
- Commit SHA:
- URL or file path:
- Test steps:
- Observed result:
- Date/time:
- Follow-up issue:

## Release policy

- Any Blocker marked FAIL or BLOCKED prevents production promotion.
- Do not downgrade an unknown to PASS because a deployment succeeded.
- If a backend or provider is unavailable, mark the feature unavailable instead of simulating a successful result.
