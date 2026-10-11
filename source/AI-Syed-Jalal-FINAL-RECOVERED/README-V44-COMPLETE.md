# Al-Syed Jalal AI V44 — AI Command & Observability Pro

V44 is a cumulative release built on V43. It adds a control-plane layer for agent topology, provider health, 24-hour AI operational metrics, bounded concurrency and provider circuit breakers.

## Architecture

User → Mission UI → AI Orchestrator → Agent Profile → Provider Router → DeepSeek/OpenAI-compatible/OmniRoute → Tools → Guardrails/Human Approval → AI Trace → PostgreSQL

## Honest runtime model

The system contains 120+ executable specialist profiles and 12 skill packs. These profiles are configurations executed by available model providers; they are not 120 separate model servers.

## New endpoints

- `GET /api/admin/ai/overview`
- `GET /api/admin/ai/graph`
- `GET /api/admin/ai/provider-health`

## Runtime protection

- `AI_MAX_CONCURRENT` default 8
- `AI_PROVIDER_FAILURE_THRESHOLD` default 3
- `AI_PROVIDER_COOLDOWN_MS` default 30000

## Validation

Run `npm run ai-control` after installing backend dependencies.
