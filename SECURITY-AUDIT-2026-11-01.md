# JalalAI Security and Reliability Audit — 2026-11-01

## Scope and confidence

Reviewed the deployed Cloudflare Pages project configuration, the production Pages Function source at commit `829e2dd38e44abcd436ff03b0a9fd4b4e8dd8ad3`, the security headers, selected regression tests, GitHub repository security settings, recent CI runs, and a read-only browser smoke test of the production deployment. This is an evidence-based source/configuration and smoke-test audit, not a full penetration test or an independent certification.

## Verified production checks

- Cloudflare reports the production deployment completed successfully at `https://084aeabe.ai-syed-jalal-live.pages.dev`.
- Read-only browser test found the homepage and login overlay, visible SJ branding, and no obvious initial-load browser errors.
- `/api/health` returned HTTP 200 and reported Neon connected.
- `/api/ready` returned HTTP 200 and reported all eight expected schema tables.
- `/api/version` returned HTTP 200 and reported V126.
- Recent GitHub source-check workflows for the deployed commit completed successfully.
- No account creation, login submission, data mutation, or database write was performed during this audit.

## Findings

### Critical — publicly exposed OpenAI API credential in tracked dataset

GitHub Secret Scanning reports open alert #1 (`openai_api_key`) and marks it `publicly_leaked: true`; validity is `unknown`. The detected location is `source/AI-Syed-Jalal-FINAL-RECOVERED/integrations/upstream/MedicalGPT/data/sft/sharegpt_zh_1K_format.jsonl` (historical alert location line 992). The current branch contained the same tracked blob. A redacted candidate was prepared in an isolated workspace, replacing all three OpenAI-key-shaped literals found in that file (two on line 992 and one on line 780). All 1,000 JSONL records parsed successfully after redaction, and no matching key-shaped literals remained in the candidate. However, the GitHub integration rejected the 4 MB file update with HTTP 413 (payload too large), so the redaction is not yet committed to the repository.

**Still required:** the credential owner must revoke the exposed key and issue a replacement. This source change does not erase earlier Git commits or public forks/caches. Do not mark the GitHub alert resolved until revocation is confirmed. A coordinated Git-history rewrite may still be needed after the key is revoked.

### High — dependency vulnerability alerts are disabled

GitHub returned `Dependabot alerts are disabled for this repository`. Dependency risk is therefore not currently evidenced as clean. Enable Dependabot alerts and dependency review before treating dependency security as verified.

### High — code scanning has never run

GitHub reports no code-scanning alerts but explicitly states code scanning has not been run. No clean static-analysis result can be claimed. Enable CodeQL or an equivalent scanner and run it on the production branch.

### Medium — rate-limit checks are non-atomic

The API checks historical counts in `audit_events` / `ai_runs` and then processes the request; the count and event insertion are separate operations. Concurrent requests can race and exceed the intended login/AI limits. A durable atomic limiter (for example, an edge rate-limit rule or a database-backed atomic counter with migration and tests) is recommended. Not changed here because it requires a production design/migration decision.

### Medium — CSP permits inline scripts/styles and loopback connections

The production `_headers` policy includes `unsafe-inline` for scripts/styles and allows `localhost` / `127.0.0.1` in `connect-src`. This weakens browser-side isolation. Tightening it safely requires inventorying and migrating inline scripts/styles and confirming no local API dependency; not changed blindly to avoid breaking the UI.

### Medium — upload size limits conflict

The shared JSON body reader caps requests at 1 MiB, while the image validator advertises per-image payloads up to 4 MB and up to four images. The effective total request cap is therefore lower than the image-specific validation suggests. Align the frontend limits and server limits in a separately tested change.

### Operational limitation — provider secrets are present, not validated

Cloudflare lists the configured secret names, including OpenAI and Gemini, but masks their values. The public smoke test did not submit an authenticated AI prompt. Provider authentication, model availability, billing/quota, and actual AI output remain unverified.

## Remediation applied in this branch

- Redacted the three OpenAI-key-shaped literals in the flagged dataset file without deleting the dataset.
- Validated all 1,000 JSONL lines after redaction.
- Production branch and live deployment were not modified.

## Release gates still open

1. Revoke the exposed OpenAI key with its owner; then update the GitHub alert as revoked.
2. Coordinate Git-history cleanup; assess forks/caches and avoid rewriting history without coordination.
3. Enable Dependabot and code scanning; review their results.
4. Implement and test atomic rate limiting.
5. Harden CSP after inline-code migration and confirm browser functionality.
6. Align image upload size limits.
7. Run authenticated login/logout/CSRF/role tests and a real provider test with a dedicated non-production account.

## Overall verdict

The latest deployment and basic health/readiness checks pass. The repository is **not yet security-clean or fully production-verified** because a publicly leaked credential requires revocation/history remediation, dependency and code scanning are unavailable, and authenticated/provider workflows have not been exercised. No production secrets, database data, or production deployment settings were changed by this audit.
