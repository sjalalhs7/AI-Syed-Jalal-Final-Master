# JalalAI Security Audit — 2026-11-01

## Immediate status

- Production deployment and basic read-only health checks pass.
- GitHub secret-scanning alert #1 reports a publicly leaked OpenAI API key in `source/AI-Syed-Jalal-FINAL-RECOVERED/integrations/upstream/MedicalGPT/data/sft/sharegpt_zh_1K_format.jsonl`. Validity is unknown. The key owner must revoke it and issue a replacement immediately. Never paste the key into chat.
- A replacement dataset was prepared in an isolated workspace: three OpenAI-key-shaped strings removed, all 1,000 JSONL records parsed successfully, and no matching key-shaped strings remain. GitHub rejected upload of the 4 MB replacement through the available integration with HTTP 413. Therefore the repository file is NOT yet redacted.
- GitHub CodeQL default setup is now configured successfully. GitHub started its CodeQL setup workflow on the default branch; results are pending.
- Dependabot vulnerability alerts/security updates remain disabled; the available connected GitHub actions do not expose the enable-vulnerability-alerts endpoint.
- Production branch and production Cloudflare deployment were not changed.

## Other findings

- The repository is public; the production and default branches are not protected. Protecting them needs care because Cloudflare deploys from the production branch and a required review can block solo-owner merges.
- Rate-limit counting is not atomic; concurrent requests can race. A proper fix requires an atomic edge/database limiter and tests.
- CSP allows `unsafe-inline` and loopback origins. Hardening requires removing inline code and validating all browser API dependencies first.
- The shared JSON body reader caps requests at 1 MiB while image validation advertises 4 MB per image and up to four images. Align the frontend/server contract before release.
- Cloudflare masks provider secret values. OpenAI/Gemini actual authentication and successful AI generation were not tested with an authenticated prompt.

## Verified tests

- `/api/health`, `/api/ready`, `/api/version`: HTTP 200; Neon connected; expected schema tables reported.
- Homepage and login interface load; SJ branding visible; no obvious initial browser-load errors.
- Existing source-validation GitHub Actions workflow passed on the audit branch: https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/actions/runs/41295136946
- CodeQL setup enabled; first workflow pending: https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/actions/runs/41295436364

## Release gates

1. Revoke the exposed OpenAI key and replace it in Cloudflare; update any other systems using it.
2. Commit the validated dataset redaction via a Git-capable route, then coordinate Git history cleanup and assess forks/caches. Do not rewrite public history before revocation and coordination.
3. Enable Dependabot alerts/security updates.
4. Review CodeQL results when the scan finishes.
5. Fix rate limiting, CSP and upload-size mismatch in separately tested changes.
6. Run authenticated login/CSRF/role tests and a real AI-provider test with a dedicated non-production account.

## Verdict

JalalAI is deployed and basic checks pass, but it is NOT yet security-cleared or fully production-verified. No production secrets, database data, or live deployment settings were changed during this audit.