# Wikipedia Knowledge Adapter

Authenticated API: GET /api/knowledge/wikipedia?q=...

AI tool: search_wikipedia. Queries are bounded to 2–200 characters, results include attribution and retrieval time, and requests have an eight-second default timeout. Wikipedia is a background/discovery source, not a primary source for current events or clinical guidance. Live connectivity must be verified after deployment.

Offline test: node tests/wikipedia-adapter.mjs.
