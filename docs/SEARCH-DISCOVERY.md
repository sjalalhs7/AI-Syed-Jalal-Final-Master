# Search discovery and verification

Canonical production origin: `https://ai-syed-jalal-live.pages.dev/`.

## Public files and metadata

- `sitemap.xml` lists public, canonical, extensionless Cloudflare Pages URLs. It is referenced by `robots.txt`; authenticated application pages stay `noindex` and are not listed.
- The public AI Hub and local Media Studio can be indexed. The editor processes selected files locally; indexing a public editor page does not publish a user's selected media.
- Public pages contain descriptions, Open Graph and Twitter card metadata pointing to the existing 1200×630 social image. These control supported social previews, not search ranking guarantees.
- `llms.txt` is a short, truthful guide for compatible AI agents. It is not a Google Search ranking signal and does not ensure that any AI service will use the file. See [Google's AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).
- A public IndexNow verification text file is included at `/203b7f5d68c6330147a1951dd4a06b29.txt`. It can be used to notify participating search engines about public URLs after it is deployed. This file is public website-verification material, not a database, Cloudflare or account credential. Do not submit private `noindex` application pages. The file alone does not prove that a notification was sent, a webmaster account was verified, or any page was indexed. Even an accepted notification is not an indexing or ranking guarantee. See the [IndexNow protocol](https://www.indexnow.org/documentation).

## Account-dependent status

The existing Google verification file is publicly served at the exact URL `/google53679754f9cff285.html`. Its presence alone does not establish that the property is verified in a particular Google Search Console account, that the sitemap has been submitted or processed, or that pages have been indexed.

No Bing XML verification file or `msvalidate.01` meta tag was found in the repository. Bing ownership may instead have been verified by DNS or by importing a verified Google Search Console property; the account status is unknown. Do not invent a verification token. See [Bing's verification methods](https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b).

If the owner already has access to those consoles, the canonical property is the origin above and the sitemap URL to submit or inspect is `https://ai-syed-jalal-live.pages.dev/sitemap.xml`. Console reports are needed to establish verification, processing, indexing and search performance. Sitemap submission is a discovery hint, not an indexing or ranking guarantee. No passwords, API keys, screenshots, new paid service or production database change is needed for the website files themselves.

## Regression checks

From `source/AI-Syed-Jalal-FINAL-RECOVERED`, run `npm run check`, `npm test`, and `npm run test:e2e -- tests/browser/search-discovery.spec.mjs`. These validate sitemap/canonical consistency, noindex boundaries, social metadata, the verification-file response, `robots.txt`, and `llms.txt` using local fixtures. They cannot inspect the owner's Search Console or Bing account and do not certify live indexing.
