# JalalAI Security Audit — Follow-up, 2026-11-01

## Remediation status

### Completed and verified
- GitHub CodeQL default setup is now configured and its setup workflow completed successfully. GitHub auto-detected Actions and Python; this is setup success, not a claim that all source has been scanned or is clean.
- Branch protection is enabled on `recovery/data-upgrade-2026-10-22` and `main`: administrators are covered, force pushes are disabled, branch deletion is disabled, and linear history is required. Ordinary direct commits remain allowed; pull-request review and required status checks are not yet enforced to avoid breaking current deployment flow.
- Private vulnerability reporting is enabled for the public repository.
- Existing source validation passed on the audit branch.

### Still open — critical credential exposure
GitHub Secret Scanning alert #1 remains open and publicly leaked. Its validity is unknown. The owner must revoke the OpenAI key and replace it in Cloudflare Pages Production secrets. Do not mark the alert resolved until revocation is confirmed.

A redacted candidate for the flagged 1,000-record JSONL file was generated and validated: three OpenAI-key-shaped strings removed, all 1,000 JSON records parse, no matching key-shaped strings remain in the candidate. GitHub's file-update integration rejected the 4.08 MB payload with HTTP 413, and its Git blob upload path also rejected the payload. Therefore the candidate is NOT committed and the exposed source/history is NOT fixed. Do not delete the dataset to work around this limit. A proper Git LFS/object-storage migration or a trusted local Git rewrite process is required, followed by coordinated history cleanup after key revocation.

### Still open — dependency alerting
Dependabot alerts and automated security updates remain disabled. The connected GitHub actions available in this workflow did not expose the required repository vulnerability-alerts/automated-security-fixes endpoint. No dependency-clean claim is made.

### Still open — application hardening
- Rate limiting uses separate count and insert operations; concurrent requests can race. Replace with an atomic durable limiter and tests.
- CSP allows inline scripts/styles and loopback connections. Tighten only after inline code is migrated and browser behavior is tested.
- API request body cap (1 MiB) conflicts with advertised image size (4 MB each, up to four). Align server and client limits.
- Authenticated login/role/CSRF tests and real AI provider tests remain unverified. Provider secret names exist in Cloudflare, but secret values are masked and were not validated.

## Production safety
No production database rows, production secrets, application code, or live deployment were modified during this follow-up. Branch protection changes are repository controls only.
