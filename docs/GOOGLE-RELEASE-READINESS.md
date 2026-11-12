# Google Search and Google Play readiness

Updated 7 November 2026. This is a technical handoff, not legal advice or a
promise that Google will index or approve the project.

## Google Search

The primary public origin and sitemap are:

- Homepage: <https://ai-syed-jalal-live.pages.dev/>
- Sitemap: <https://ai-syed-jalal-live.pages.dev/sitemap.xml>
- Robots: <https://ai-syed-jalal-live.pages.dev/robots.txt>

Cloudflare Pages serves HTML files at extensionless URLs and redirects `.html`
URLs. The sitemap and canonical tags therefore use the final extensionless
URLs. GitHub Pages remains a static preview: its links retain `.html` so that
host works too, and the canonical site remains Cloudflare. The signed-in app
pages deliberately use `noindex`; the public JARVIS overview is separate.

The existing Google verification file is included. A Pages Function serves its
exact `.html` URL without a redirect on Cloudflare. It is an existing public
verification token, not evidence that the current user's Search Console property
is verified; Google must still confirm ownership. Static hosts serve the file
directly. Confirm the exact URL returns 200 after deployment.

**Owner steps:**

1. In [Google Search Console](https://search.google.com/search-console/), add and
   verify a URL-prefix property for `https://ai-syed-jalal-live.pages.dev/`.
   Use the file if it belongs to your Google account; otherwise follow Google's
   verification wizard. Do not send account credentials here.
2. Submit `https://ai-syed-jalal-live.pages.dev/sitemap.xml` under Sitemaps.
3. Use URL Inspection on the homepage and public JARVIS overview, run the live
   test, and request indexing. Monitor results; crawling and indexing are not
   guaranteed or immediate.

[Google's sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
and [recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
explain these steps.

## Live database

On 7 November 2026, the public `/api/ready` endpoint reported **13 of 24**
required table names. Counts may change; check the live endpoint again. It
checks required table names, not every migration, column, index, data item or
provider. A database connection and a successful local test do not prove
production is ready.

Before any approved repair, the owner must verify a restorable **full database**
backup and rehearse against an isolated target. The Workspace Records Backup
exports active records only and is not a complete database backup. Repair can
leave partial changes if statements fail. See
[`PRODUCTION-DATABASE-SAFETY.md`](PRODUCTION-DATABASE-SAFETY.md) for the
recovery, authorization and verification steps. Do not share or commit
credentials. This repository update does **not** apply migrations to production.

## Google Play — still blocked

The Android folder is a provisional TWA, not a completed Play submission. It
targets API 36. The old debug APK was retained only for diagnostics and is
known to crash on Android 15; **do not use it**. The earlier 1.0.1 candidate
is also superseded because it did not restrict an explicit launch intent to
the intended website. The
[1.0.2 signed test candidate](https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/releases/tag/android-mobile-1.0.2-candidate-v1)
fixes the reproduced crash, restricts launch URLs, and opened the homepage on
Android 8, 11 and 15 emulators. It has not been tested on a physical phone, is
not Play-approved, and may still show an installation warning. A build or
emulator test does not prove physical installation, verified website
association, microphone support, security, policy compliance or Play
acceptance. The application ID remains provisional. See
[`android/README.md`](../android/README.md) for signing, Digital Asset Links
and the separate exact-byte test evidence.

Before submitting, the operator must:

- Confirm the permanent app ID; sign an Android App Bundle with a securely held
  upload key; publish correct Digital Asset Links using the Play **app signing**
  certificate; and test on physical Android devices.
- Publish an accurate privacy policy with a real operator/privacy contact,
  retention and deletion details, and complete the Play Data Safety declarations.
  No contact or retention period is invented in this repository.
- Provide an in-app and public web way to request account and associated data
  deletion, and a process that actually fulfills requests. The current source
  does not yet provide a complete deletion flow. Shared records, audit data,
  backups and third-party retention need an owner-approved policy.
- Reporting controls and an Admin review queue are included for the main AI
  surfaces. Submitting is explicit and stores the chosen excerpt, reason, optional
  context and account identity; chat history-off does not erase a report. An
  Admin reviews the oldest open reports under **Workspace → Operations → AI
  content reports**. Production reporting requires the new database migration.
  Establish a confidential moderation process, define report retention and
  deletion, test it in production, and use reports to improve content filtering
  and safeguards. Marking a report reviewed does not itself moderate content.
- Repair and test the production backend, provider calls, account/reviewer
  access, permissions and every advertised feature; prepare accurate listing
  copy, graphics, content rating and other Play declarations.
- Verify the Play developer account and satisfy any applicable testing rules.
  New personal accounts created after 13 November 2023 generally need at least
  12 testers continuously opted in to a closed test for 14 days before applying
  for production access.

Google references: [target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878),
[User Data and privacy policy](https://support.google.com/googleplay/android-developer/answer/10144311),
[account deletion](https://support.google.com/googleplay/android-developer/answer/13327111),
[AI-generated content](https://support.google.com/googleplay/android-developer/answer/13985936),
[developer account testing](https://support.google.com/googleplay/android-developer/answer/14151465),
and [Trusted Web Activity setup](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start/).
