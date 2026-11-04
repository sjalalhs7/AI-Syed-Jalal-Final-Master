# V140 — Arena-class surfaces and a real agent toolbox

Date: 4 November 2026 · Base: `main` @ `bf4001d` (V138) + V139 · Repo: `sjalalhs7/AI-Syed-Jalal-Final-Master`

## What was asked

> "Make and add ArenaAi all qualities and clone of this, every code and web-developing code of Arena,
> and also other powerful agent codes add and merge in our websites."

Two asks: bring the Arena surface up to the qualities a comparison workspace is judged by, and add
genuinely powerful **agent** capability rather than more pages that describe capability.

Both were built as original code in this stack. Nothing is copied from another product, and the
Arena page says so in the same breath as it lists what it does (`ARENA_POSITIONING`).

## 1. Eight new agent tools — twelve in total

The V136 runtime shipped four tools. V140 adds eight, each one replacing a browser tab, each one
deterministic, each one reproducible from its input alone:

| Tool | What it really does | Why it earns its place |
| --- | --- | --- |
| `datetime` | Time in ~45 named zones, day counts between ISO dates, add days/weeks/months | "Time in Tokyo" and "days between" are the two most-asked date questions; month addition clamps 31 Jan + 1 month to 28 Feb instead of silently rolling into March |
| `units` | Length, mass, volume, data size, speed + Celsius/Fahrenheit/Kelvin | Refuses cross-dimension conversions (`km → kg`) instead of returning a number |
| `json` | Validates, reports shape/keys/bytes, returns formatted JSON | Reports the character offset of a syntax error; never reformats invalid input |
| `hash` | SHA-256/1/384/512, UUID v4, Base64 encode/decode | `sha256("hello")` returns the published digest — a value nobody can fake |
| `contrast` | WCAG 2.2 contrast ratio with an AA/AAA verdict | Says "passes AA only for large text" at 4.48:1 rather than rounding up to a pass |
| `csv` | Parses a CSV, names columns, sums/min/maxes numeric ones | Correctly separates numeric columns from text ones |
| `audit` | 16 deterministic HTML/CSS/JS checks: missing `lang`, `img` without `alt`, `target=_blank` without `noopener`, `eval`, `innerHTML`, outline removal, SQL string interpolation | Ends with *"these are deterministic pattern checks, not a security review"* |
| `diff` | Exact LCS line diff with added/removed/unchanged counts | Exact, not a heuristic — inputs are capped so the table stays small |

Every tool is registered in one place (`frontend/functions/toolbox.mjs`), published by
`/api/agent/capabilities`, planned by the agent runtime, and rendered by the new **Toolbench**
page. There is no second implementation anywhere.

**Two capability doors open at once:** the new `toolbench.html` runs any tool by hand, and the
All-in-one panel now routes *tool* requests to the agent using the toolbox's own matcher — so
"convert 10 km to miles" in the panel reaches the tool that can answer it. Before this change the
panel used a hand-kept keyword list and answered that prompt with a generic plan.

## 2. Arena qualities added

| Quality | What shipped | Honest limit |
| --- | --- | --- |
| **Prompt library** | 12 prompts, each with a *checkable property* printed on the card, plain-text search, category filter, one click loads it into the battle composer. Readable before sign-in. | It is content, not machinery — it cannot tell you which engine will win |
| **Live artifact preview** | HTML/SVG answers render in a sandboxed iframe (scripts isolated, no referrer); everything else is copyable code | The frame is sandboxed, not a security boundary for untrusted answers |
| **Portable battle export** | A decided battle downloads as Markdown with prompt, every answer, rubric sub-scores, judge's reason and notes | Export is blocked while a battle is still blind — the file would otherwise hide engine names |
| **Feature map** | Now 10 shipped / 1 needs-key / 3 deliberately absent, each with its evidence | Still honestly absent: image battles, public leaderboard, human-annotation pipeline |

The prompt library includes the **fabrication test** — a prompt whose correct answer is "I cannot
verify this" — because the fastest way to judge an engine is to ask it something it cannot know.

## 3. What the critic says, and what it needs

The Expert Critic grades this deployment from stored evidence, and it is deliberately unimpressed
by a fresh account: on an empty database it scores **reliability 0** ("0 stored agent run(s)")
and **honesty 65**, giving a *conditional* overall verdict. That is the correct behaviour — a
review that awards 95/100 to a deployment with no runs recorded would be worthless.

Critic quotes after exercising the product on this build:

- Self-check on a fresh preview account: **100/100, 19/19 checks pass**, with the 12-tool runtime.
- Arena battle (`local-critic` vs `local-planner`): judge scored 65 / 77, winner `b`, full export
  2,400 characters including the rubric.
- Panel run of a tool request now returns the agent card plus its trace.

## 4. Gates

| Gate | Result |
| --- | --- |
| `npm run check` (static) | **47/47 pass** (was 41) |
| `node --test server/tests/*.test.mjs` | **85/85 pass** (was 76) |
| `npm --prefix frontend test` | **80/80 pass** |
| `node server/test-browser.mjs` | **26/26 pass** (was 23) |
| Live self-check | **100/100 · 19/19 checks** |

New tests: `server/tests/toolbox-v140.test.mjs` (10 tests — every tool, the router regression, the
prompt library contract, battle export, feature map) and `tests/browser/toolbox.spec.mjs`
(3 journeys — three real tool runs in the browser, an example for all twelve cards, the prompt
library loading into the composer).

Three V136 assertions that pinned `AGENT_TOOLS.length === 4` were updated to assert the *contract*
(a bounded, duplicate-free, published list that never loses a required tool) instead of a magic
number — and the self-check now enforces the 4–16 bound and the required-tool list itself.

## 5. Still not proven

Unchanged from V139 and stated on the pages that would otherwise imply it: live cloud provider
calls (no keys supplied), a physical microphone in headless CI, ElevenLabs voice, Gmail/Calendar/
WhatsApp, production Neon migrations, and load testing. No image or video generation exists.

## Try it

```sh
npm ci && npm --prefix frontend install && npm run dev
```

Then `/guide.html` → **Try the local preview** → `/toolbench.html` (twelve tools by hand),
`/allinone.html` (one request, every specialist), `/arena.html` (battles, prompt library, export),
`/critic.html` (the graded review of this deployment).
