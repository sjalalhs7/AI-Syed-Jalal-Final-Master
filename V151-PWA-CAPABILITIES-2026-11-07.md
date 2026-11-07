# V151 — The app now behaves like an app on your desktop, not just a tab

Date: 7 November 2026 · Base: `main` @ `cf16c2e` (V150.1) · Repo: `sjalalhs7/AI-Syed-Jalal-Final-Master`

## What changed

Ten operating-system capabilities from the *app capabilities* list are now
declared **and** implemented, not just advertised:

| Capability | Manifest member | What the code does with it |
| --- | --- | --- |
| Shortcuts | `shortcuts` | Four entries (New note, Start here, Workspace, Arena), each with its own 96 px icon. |
| File handlers | `file_handlers` | `.txt`/`.md` files opened from the OS are read **in the tab** and dropped into Quick Notes. |
| Launch handler | `launch_handler` | `navigate-existing`: launching again focuses the window you already have. |
| Protocol handlers | `protocol_handlers` | `web+ajalal://` links land on `protocol.html`, which shows the link and takes no action on it. |
| Share target | `share_target` | `share-target.html` receives text/links from the Android/ChromeOS share sheet. |
| Widgets | `widgets` | "New note" widget for the Windows 11 widgets board, with a service-worker lifecycle (`widgetinstall`, `widgetresume`, `widgetclick`, `widgetuninstall`, `periodicsync`). |
| Edge side panel | `edge_side_panel` | 420 px docked view in Microsoft Edge. |
| Window controls overlay | `display_override` | The header draws into the titlebar area; `env(titlebar-area-*)` drives a real drag region. |
| Tabbed display | `display_override: ["tabbed", …]` | Tab strip with a pinned home tab and a new-tab button that opens a new note. |
| Note taking | `note_taking` | The OS "New note" entry opens `notes.html?new=1` with the editor focused. |

### New surfaces

- **`notes.html` — Quick Notes.** The single destination for the shortcut, the
  widget, the note-taking entry and handled files. Capture, copy and download
  need no account; *Save to workspace* uses the same explicit
  `/api/assistant/confirm` route the assistant already demands.
- **`share-target.html`** — shows what another app shared and offers to keep it.
- **`protocol.html`** — shows a `web+ajalal://` link as received, flags an
  unparseable one, and never opens it for you.
- **`capabilities.html`** — a live probe of all ten capabilities on *your*
  device, with a three-state badge: **Available**, **Not available**, or
  **Decided by the OS** where no page can query the platform (widgets, note
  taking, the share sheet).

### Assets and shell

- Real PNG icons (192/512, maskable 512, Apple touch 180) generated from the
  approved logo, plus six distinct shortcut glyphs and a widget preview.
- Six screenshots captured from the running app for the install prompt and
  store listings.
- `sw.js` cache bumped to `aj-v151-shell`; the new public shells are precached,
  and `notes.html` / `share-target.html` are **excluded from every cache write**
  because they carry someone's content.

## The rule this release keeps

`server/tests/pwa-capabilities-v151.test.mjs` (13 checks) and
`tests/browser/pwa-capabilities.spec.mjs` (10 journeys) fail the build if:

1. The manifest stops parsing, or an install prompt loses its 192/512/maskable icons.
2. Any URL, icon, screenshot, widget template or shortcut the manifest names is
   missing, or declares a size or MIME type the bytes do not have.
3. A widget binding (`${title}`…) has no value in its data file — the widget
   would otherwise render literal `${title}` on a user's desktop.
4. An inbound share, file or link is stored or uploaded **before** the person
   presses Save, or is sent to the assistant without review.
5. The capability page claims support it did not measure — every undetectable
   row must say "Decided by the OS" and name the platform.
6. A private or content-bearing shell enters the service-worker cache.

## Verified on this pass

- Chromium's own manifest parser: **0 errors**, `Page.getInstallabilityErrors`
  reports **0 errors**; all ten members parse as declared.
- 141 server tests, 80 frontend tests, 51 static checks, 23 recovery tests,
  50 browser journeys (40 existing + 10 new) — all green.
- Screenshots in `assets/app-shots/` are real captures of the running app, not
  mockups.

## Not proven, and therefore not claimed

- **Windows widgets, ChromeOS tablet mode, ChromeOS tab strips and the Edge side
  panel were not executed here** — no such device was available. The manifest
  members are spec-correct and the service worker handles every widget event,
  but "shipped" for those four means *implemented and tested where a browser can
  be tested*, not *seen working on the OS*.
- The share sheet and OS "New note" entry are OS-owned UI; the app can only
  declare itself and handle what arrives.
- No push notifications, background sync or file-system access were added in
  this release.
