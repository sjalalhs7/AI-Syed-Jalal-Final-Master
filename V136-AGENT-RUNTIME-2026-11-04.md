# V136 — Real agent runtime: tool calls you can watch

Date: 4 November 2026 · Base: `main` @ `c008d35` (V135) · Repo: `sjalalhs7/AI-Syed-Jalal-Final-Master`

## The gap this closes

Until V136 the "agent" surfaces were profiles and templates. The label *Agent* promised more than the
code did. A **real Wikipedia adapter already existed in `backend/knowledge/` and was wired to nothing** —
no route, no page, no test in the app. V136 turns that into an honest, bounded agent runtime.

## What "agent" now means, precisely

| Claim | What the code actually does |
| --- | --- |
| Uses tools | **Four published tools only**: `calculator`, `research` (live Wikipedia), `records` (read-only DB search), `tasks` (read your tasks/notes). `GET /api/assistant/agent/tools` returns the list. |
| Plans | `planFor(prompt)` maps the request to 1–4 steps. A prompt with no matching tool produces a `none` step that says no tool ran. |
| Shows its work | Every step returns `{ ok, ms, observation }`. The UI renders an **agent trace** panel with real durations and real output. |
| Fails honestly | A throwing or slow tool (>9 s) becomes a recorded failure with its message; the run continues and the answer says `FAILED`. |
| Is bounded | Max 4 steps, 9 s per step, 12 runs/minute per account. |
| Is auditable | Each run is persisted in `agent_runs` with its step trace; `GET /api/assistant/agent/runs[/:id]` is owner-scoped. |

The footer of every run states what it does **not** prove: only the listed tools ran, each call is shown,
and nothing executed outside the app except the Wikipedia request when present.

## Shipped

- `frontend/functions/agent-runtime.mjs` — plan builder, tool executor, timeout isolation, `recordRun`.
- `frontend/functions/wikipedia-adapter.mjs` — the existing adapter, copied into the Functions bundle so
  the Cloudflare build stays inside `frontend/` (same file the backend test already covers).
- `POST /api/assistant/chat` with `mode: 'agent'` or `'research'`; `GET /api/assistant/agent/tools`,
  `/agent/runs`, `/agent/runs/:id`; `GET /api/assistant/state` now advertises the tool list.
- `jalalai.html` / `assets/jalalai.js` / `assets/jalalai.css` — new **Agent mode** and **Research** engine
  options, a live tool list under the selector, and the rendered trace with per-step timings.
- Migration `012_v136_agent_runtime.sql` (`agent_runs`); readiness **19 → 20** tables.
- Agent Lab self-check **17 → 18** checks: `agent.tool-runtime` verifies the published tool list, plan
  bounds, and the calculator result on every run.

## Verification

| Gate | Command | Result |
| --- | --- | --- |
| Static | `npm run check` | 31/31 |
| Frontend contracts | `npm --prefix frontend test` | 80/80 |
| Server + integration | `node --test server/tests/*.test.mjs` | **54/54** (8 new agent-runtime tests) |
| Browser journeys | `npm run test:e2e` | **14/14** (new: agent trace incl. failure path) |
| Backend release gate | `npm --prefix backend run test:release` | 8 suites PASS |
| Dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |

Live check: `calculate (1200 + 350) * 15% * 3 and show my tasks` →
`2 step(s) · 2 tool call(s) · 0 failure(s)`, step 1 returns `= 697.5`.

## Still not claimed

The sandbox blocks outbound Wikipedia, so in this environment the research tool reports `fetch failed`
— which is the correct behaviour and is exactly what the tests assert (a failure is a failure, never an
invented article). On a host with egress the same code returns real titles, snippets and links with
CC BY-SA attribution.
