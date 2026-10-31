# Search engine setup and verification

## Implemented in source
- Canonical URL and Open Graph/Twitter large-image metadata in the homepage.
- `robots.txt` points to the current Cloudflare Pages hostname.
- `sitemap.xml` uses the current hostname and lists the public homepage.
- `llms.txt` describes the project while explicitly distinguishing source-code presence from verified live integrations.
- CodeRabbit review guidance is in `.coderabbit.yaml`.

## Google Search Console — account-owner step required
1. Open https://search.google.com/search-console/ and add `https://ai-syed-jalal-live.pages.dev/` as a URL-prefix property.
2. Use the verification method Google offers for this property. If it requires a meta tag or HTML file, add the exact token/file Google provides to the deployed frontend; do not guess the token.
3. After ownership verification, submit `https://ai-syed-jalal-live.pages.dev/sitemap.xml` and inspect the homepage URL.

## Bing Webmaster Tools — account-owner step required
1. Open https://www.bing.com/webmasters/ and add `https://ai-syed-jalal-live.pages.dev/`.
2. Verify ownership using the exact DNS, meta-tag, or XML file instructions shown in the account.
3. Submit `https://ai-syed-jalal-live.pages.dev/sitemap.xml`.

## Release checks
- Confirm the actual production hostname before replacing the canonical host if a custom domain is later connected.
- Confirm `/`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, and the social-card image return HTTP 200 on the deployed site.
- Use Google's Rich Results/URL Inspection tools and a social-card preview validator after deployment.
- Search Console and Bing ownership are not marked complete until verified in the respective accounts.
