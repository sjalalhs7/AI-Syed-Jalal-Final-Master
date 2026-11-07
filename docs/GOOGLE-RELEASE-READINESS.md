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

On 7 November 2026, the public `/api/ready` endpoint reported **13 of 23**
required tables. Counts may change; check the live endpoint again. It checks
required table names, not every migration, column, index, data item or provider.
A database connection and a successful local test do not prove production is
ready.

The owner should review the existing database and take a suitable Neon backup,
then sign in as an Admin, open **Workspace → Operations → Database Schema**,
and use **Repair schema** if they approve applying the bundled migrations. The
route requires Admin authentication and an explicit confirmation. Review any
failed migrations, re-check `/api/ready`, then exercise affected features with
safe test data. Do not share or commit credentials. This repository update does
**not** itself apply migrations to production.

## Google Play — still blocked

The Android folder is a TWA **starting point**, not a release. It targets API 36
and CI attempts a debug APK plus unsigned AAB. A successful build does not prove
installation, website association, microphone support, security, policy
compliance or Play acceptance. The application ID is provisional. See
[`android/README.md`](../android/README.md) for signing and Digital Asset Links.

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
- Provide in-app reporting of offensive AI-generated content, review reports and
  implement/test appropriate AI safeguards. The current source does not yet
  provide a complete reporting workflow.
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
[AI-generated content](https://support.google.com/googleplay/android-developer/answer/18258653),
[developer account testing](https://support.google.com/googleplay/android-developer/answer/14151465),
and [Trusted Web Activity setup](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start/).
