# V56 Early Access — Public Internet Launch

## Important
The package is ready for deployment, but an actual public early-access URL is not embedded in the ZIP. A public URL must be created by deploying the project to an account you control.

## Recommended launch architecture
- Frontend/public website: Vercel or Cloudflare Pages.
- Node backend/API: a Node-capable host such as Railway/Render or your own VPS.
- PostgreSQL: managed PostgreSQL in the same region as the backend where possible.
- Custom domain: connect after the first successful deployment.

## Early-access flow
1. Put the final source in a private GitHub repository.
2. Deploy the frontend.
3. Deploy the Node backend.
4. Create/attach production PostgreSQL.
5. Set production environment secrets on the server — never put AI keys in frontend code.
6. Configure the frontend API origin.
7. Run login, AI, database, document, audit and mobile smoke tests.
8. Share the generated HTTPS URL as the early-access link.
9. Add the custom domain after acceptance testing.

## Public discovery
After launch, submit the sitemap to Google Search Console and Bing Webmaster tools, keep the canonical URL correct, and publish useful pages describing the product, use cases, documentation and contact/early-access flow. Search indexing is not instantaneous and cannot be guaranteed by the application itself.
