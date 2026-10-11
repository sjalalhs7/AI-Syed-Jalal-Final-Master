# AI-Syed Jalal V53 — Discovery & Growth Process

## How people find the web app

V53 contains the technical discovery layer needed for search engines and link previews:

1. `frontend/robots.txt` permits crawling and points crawlers to the sitemap.
2. `frontend/sitemap.xml` declares the public canonical website URL.
3. The homepage contains canonical, description, Open Graph, Twitter, robots and structured-data metadata.
4. JSON-LD describes the website, organization and software application.
5. The PWA manifest improves browser/app discovery and installation.
6. `frontend/updates.xml` provides a simple public update feed.
7. `frontend/llms.txt` gives AI/search systems a concise factual description of the product.

## What still requires human account access

Search engines will not be guaranteed to rank a site merely because metadata exists. The owner should submit the sitemap through:

- Google Search Console: add the site/property and submit `/sitemap.xml`.
- Bing Webmaster Tools: add the site and submit the same sitemap.
- Social profiles: publish the canonical website URL consistently.
- Product/community profiles: use the same product name, description and canonical URL.

No fake search-engine submission or ranking claim is included because those actions require the owner's accounts and verification.

## Practical growth funnel

Search/social post → public homepage → clear value proposition → demo/login → product usage → shareable result/link → returning visitor.

For future growth, publish useful public pages for specific search intent such as AI research, AI coding, document automation and business data workflows. Do not create doorway pages or keyword spam.

## Production note

The public GitHub Pages frontend is suitable for discovery and installation. Real shared authentication, central PostgreSQL data and provider-backed AI require the deployed backend/API and HTTPS.
