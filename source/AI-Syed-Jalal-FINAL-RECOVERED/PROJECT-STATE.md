# Al-Syed Jalal AI — Canonical Project State

**State updated:** 2026-10-26  
**Purpose:** Preserve approved requirements and avoid restarting or silently redesigning approved work.

## Locked brand and UI requirements

- Brand monogram is **SJ = Syed Jalal**.
- The SJ letters are **rainbow-coloured**, with the **gold crown above** and the luminous multicolour orbit/ring treatment shown in the approved reference image.
- Canonical scalable logo asset: `frontend/assets/approved-sj-rainbow-crown.svg`.
- The approved reference is the saved Library image `AI-Syed Jalal Cyber Command Center.png`; its design direction includes the dark futuristic command centre, colourful 3D cards, animated/glowing surfaces, 360-degree globe/orbit visual, side navigation, quick actions, live-collaboration area, agent list, system status, activity, and separate feature launch cards.
- Keep the homepage, login surface, workspace, dashboards, navigation, and responsive layout aligned to this identity. Do not replace the logo with the old abstract orbital emblem, do not add a second competing logo, and do not restart the UI from a generic template.
- Different modules should have their own meaningful dashboard/controls, not merely duplicate cards. Every action must have a real route and an honest state.

## Canonical source and infrastructure

- Git repository: `sjalalhs7/AI-Syed-Jalal-Final-Master`.
- Working branch: `recovery/data-upgrade-2026-10-22`.
- Recovered application source root: `source/AI-Syed-Jalal-FINAL-RECOVERED/`.
- Cloudflare Pages project: `ai-syed-jalal-live`; production host `https://ai-syed-jalal-live.pages.dev`.
- Neon project: `ai-syed-jalal-db` (`lively-dream-26802647`), branch `main` (`br-divine-wave-azbmoqqp`), database `neondb`.
- Do not switch to Render or create paid infrastructure without explicit approval. Render previously required payment details; no paid deployment is presumed.
- Never place API keys, database URLs, passwords, or session secrets in source control, reports, or chat.

## Existing agent/skill ecosystem to recover and wire

- Recovered agent catalog: V42, 120 roles/profiles.
- Recovered skill registry: V71, 3,500 skills across 35 domains.
- Agency registry/tool catalogue, Supervisor and bounded AutoGPT systems, UX/UI Pro Max, OmniRoute, Gemini/AI Studio, DeepSeek, OpenAI-compatible provider support, Wikipedia adapter, roadmaps, and UI/API contract tests are present in the recovered source.
- User-requested agent/assistant families include Power AI Assistant, Superpower, OpenGPT, UX/UI Pro Max, OmniRoute, Omniverse, Mission Orchestrator/Supervisor/AutoGPT, Knowledge Vault, Voice Agent, Health Agent, research, coding, creative and analysis assistants. These names are requirements to map to recovered implementations, not evidence that every runtime is already live.

## Current implementation facts and boundaries

- Cloudflare Pages Functions file: `frontend/functions/api/[[path]].js`.
- The Pages API has server-side adapters for OpenAI/ChatGPT, Anthropic/Claude, DeepSeek, Google Gemini, and an optional OpenAI-compatible OmniRoute endpoint. A successful real response requires valid server-side credentials and a live provider request.
- OmniRoute should accept both the Pages names (`OMNIROUTE_API_KEY`, `OMNIROUTE_BASE_URL`) and the recovered backend names (`OMNIROUTE_KEY`, `OMNIROUTE_URL`). The endpoint must use HTTPS.
- Pages capability discovery should report the recovered 120-profile and 3,500-skill/35-domain inventory, but clearly distinguish catalogue/profile availability from actual tool execution.
- The current Pages `/api/chat` path has been identified as a simulated demo response; it must not be represented as a real model answer. Replace it with a truthful sign-in/provider-backed path or disable it clearly; do not fake tool use or completion.
- Voice/audio, camera/screen awareness, medical workflows, external browser/device control, and external side effects require dedicated runtime/integrations, permissions, safety gates, and tests. Do not show them as “live” based only on a card or catalog entry.
- Neon previously contained core tables and an `ai_runs` table was added. Current read-only table check reports `ai_runs`, `app_users`, `approvals`, `audit_events`, `documents`, `record_history`, `records`, `schema_migrations`, `sessions`. Do not blindly rerun migrations or seed/overwrite an administrator in production; inspect schema and use a safe test branch/environment first.
- `deployment/online/docker-compose.production.yml` now uses project-root build context `../..`, `backend/Dockerfile`, and the `../../frontend` static mount. Validate from a clean checkout before relying on it.

## Progress and acceptance evidence

- Canonical rainbow SJ crown SVG added and referenced by the homepage, workspace, dashboard, projects, roadmaps, visual library/styles, and intelligence-evolution pages.
- Homepage now has distinct launch cards for the named agent families, with links to existing workspace/dashboard pages.
- Agent capability endpoint reports 120 catalog profiles and 3,500 skills across 35 domains, with explicit runtime limitations; OmniRoute environment aliases are supported.
- Inline JavaScript syntax checks passed for the modified HTML pages and API handler; canonical logo SVG XML parsed successfully.
- Latest Pages deployment must be checked by commit hash and all stages before stating it is live. Public website/browser, login, CSRF, database persistence, provider calls, mobile behavior, voice, health safety, and tool-driven task completion remain **not verified** until their tests produce observable evidence.

## Mandatory workflow for future changes

1. Start from this document and the existing branch/registry. Never regenerate the project from scratch.
2. Preserve approved brand/layout unless the product owner explicitly asks for a change.
3. Make small reversible commits; run syntax, catalog/contract, security, and integration checks after each meaningful change.
4. Keep the status vocabulary exact: **VERIFIED / FAILED / BLOCKED / NOT TESTED**.
5. Do not claim a provider, agent, dashboard action, or deployment is working without an observed end-to-end test.
6. No destructive database changes, paid services, secret rotation, or public-launch decision without the required approval.
