# Production Readiness Audit — 2026-11-02

## Verdict

**Do not switch Cloudflare production to `main` until the database migrations are applied and the live readiness endpoint passes.** The newest unified application is in `main`, but the Cloudflare Pages project was observed configured to publish `recovery/data-upgrade-2026-10-22` instead.

## Verified facts

- GitHub `main` commit audited: `7633be8431391f8e30d54be9100741678ebae326` (unified V129 app, including the workspace and SJ Agent Studio).
- Cloudflare Pages project: `ai-syed-jalal-live`; configured production branch: `recovery/data-upgrade-2026-10-22`.
- Latest canonical Cloudflare production deployment observed: commit `d5b08d71a68cd0030ccaa70bd6df230ef34a0a10`, from 2026-10-31. This is not the latest `main` commit.
- The Neon project `ai-syed-jalal-db`, default database branch `main`, has 8 of the 13 tables required by the V129 readiness check.
- Missing tables: `auth_rate_limits`, `assistant_tasks`, `assistant_notes`, `platform_conversations`, `platform_messages`. The V127–V129 additive migrations exist in GitHub `main`, but were not present in the inspected production database at audit time.
- The recovery archive verifier passed: SHA-256 `21dc9b76289706ea12640cd6579e7efedb8215ca50d7c70f411b2fe09649369c`, 172,636,153 bytes, 9,990 files, 12,156 ZIP entries, CRC pass.
- Before installing project dependencies in this audit environment: all 71 frontend tests passed; the recovery verifier's 23 tests passed; all 22 static application checks passed. Two server test files could not start because `@electric-sql/pglite` was not installed in the audit sandbox. The new CI workflow installs the lockfile dependencies before running the complete test suite.

## Security finding

A secret-pattern scan found OpenAI-style key material inside the public recovery archive's upstream `MedicalGPT/data/sft/sharegpt_zh_1K_format.jsonl` file. The value is deliberately not reproduced here. Treat it as exposed until the provider confirms it is revoked. GitHub marking a secret-scanning alert “Fixed” does not by itself prove the credential was revoked. The archive was not rewritten during this audit because changing one part without rebuilding and re-verifying the complete archive would break the recovery checksum.

## Required deployment sequence

1. Run the locked dependency install and complete test workflow.
2. Apply the reviewed additive migrations `005_v127_auth_rate_limits.sql`, `006_v128_assistant_tools.sql`, and `007_v129_agent_platform.sql` to the Neon production branch.
3. Verify the five required tables exist and `/api/ready` returns HTTP 200 with all 13 required tables.
4. Only then switch Cloudflare Pages production branch to `main`, deploy, and recheck `/api/health`, `/api/ready`, `/api/version`, login, AI provider calls, and JalalAi voice.

No secrets are included in this report. Do not paste provider keys into issues, commits, screenshots, or chat.
