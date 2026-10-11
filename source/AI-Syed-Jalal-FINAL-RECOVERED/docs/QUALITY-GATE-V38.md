# V38 Quality Gate

V38 adds a repeatable release-quality layer around the existing enterprise backend/frontend.

## Gates

1. Node syntax checks for backend, migration, verification and test scripts.
2. Frontend JavaScript syntax check.
3. Production environment verification.
4. Static structure quality gate.
5. API health/readiness smoke test.
6. Request-ID uniqueness/load smoke check.
7. Browser end-to-end navigation test with Playwright.
8. Pages deployment remains protected by a GitHub environment and concurrency group.

GitHub Actions supports environments, protection rules and concurrency for controlled deployments. Playwright supports CI execution and browser installation through its CLI. See the official documentation for the current workflow model.

## What this does NOT prove

A passing CI run does not prove that a real production PostgreSQL instance is healthy, that credentials are valid, or that an external deployment provider is reachable. Those require the real environment and secrets.

## Local commands

```bash
node tests/quality-gate.mjs
node backend/tests/smoke.mjs
SMOKE_URL=http://127.0.0.1:8787 LOAD_SAMPLES=50 node tests/load-smoke.mjs
npx playwright@1.63.0 install --with-deps chromium
npx playwright@1.63.0 test
```
