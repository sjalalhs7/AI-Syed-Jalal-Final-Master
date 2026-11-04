# V134 — working reply actions, evidence export and clickable skills

Date: 4 November 2026 · Base: `main` @ `e1f1f94` (post-#25/#26) · Repo: `sjalalhs7/AI-Syed-Jalal-Final-Master`

## Why

V133 shipped the Agent Lab. Two gaps remained that a critic would find immediately:

1. **Agent Studio's reply buttons were decorative.** "Copy" only wrote to the clipboard, and there was
   no "Regenerate" at all. Neither survived a reload, so nothing proved they existed.
2. **Agent Lab evidence could be downloaded but not re-run per micro-change, and skill cards were inert.**
   A searchable library that cannot be *used* is a list, not a tool.

## Shipped

### Agent Studio — real Copy and Regenerate (`frontend/assets/agent.js`)
- **Copy** copies the text *and* saves it as a new **Direct** turn with its own answer, so the action is
  visible in the transcript and survives a reload when history is on.
- **Regenerate** re-runs the same prompt on the same engine and **replaces** the stored reply instead of
  appending a second one. Compare cards get **Regenerate both**, which swaps the pair while keeping a
  single prompt. Each reply carries a `reply_to` anchor; every row sharing it is replaced together.
- The reply row is written **before** generation. If generation fails the row is flagged `failed`
  (the reply shows "not generated"), the prompt is never lost, and the retry targets the same row.
- Rejected requests (oversized or unsupported attachments) are now validated **before** anything is
  persisted, so a 413 can no longer leave a prompt with no reply.

### Migration `010_v134_message_actions.sql` (+ fresh-DB copies)
- `platform_messages.reply_to uuid` with an index, and `platform_messages.status` (`ok` | `failed`)
  with a partial index. Additive and replay-safe; the API contract still requires **15** tables.

### Agent Lab — evidence CSV and clickable skills (`frontend/agent-lab.js`)
- **Evidence CSV** — one row per check (`check_id,title,group,weight,severity,passed,detail,duration_ms`),
  ready for a spreadsheet or an audit trail, alongside the existing JSON export.
- Every skill card now has **Use in Studio** and **Critique with it**: the card stages a real prompt,
  copies it, and opens Agent Studio with it pre-filled (`agent.html?draft=1`).
- Self-check grew to **16 checks** with `studio.reply-actions`, which fails if the `reply_to`/`status`
  columns are missing and reports how many replies are awaiting retry.

## Verification

| Gate | Command | Result |
| --- | --- | --- |
| Static | `npm run check` | 27/27 |
| Frontend contracts | `npm --prefix frontend test` | 80/80 |
| Server + integration | `npm test` | **32/32** (4 new: copy, regenerate, compare pair, rejection-safety) |
| Browser journeys | `npm run test:e2e` | 11/11, incl. copy → regenerate → reload in Agent Studio, CSV + skill staging in Agent Lab |
| Backend release gate | `npm --prefix backend run test:release` | PASS |
| Dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |
| Live API round-trip | local server | copy adds one turn, regenerate keeps 4 messages / 2 users / 2 replies, self-check **16/16 = 100, pass** |

## Still not claimed

No live cloud provider call (unconfigured providers are refused, never simulated), no ElevenLabs,
no Gmail/Calendar/WhatsApp/OpenJarvis, no production deployment, Neon migration or load certification.
