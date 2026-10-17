# Architecture

AI-Syed Jalal is a browser frontend paired with a Node.js API and PostgreSQL persistence layer.

## Main layers

- `frontend/` — static web application, responsive UI, login, Regions/Sectors, data entry, import/export, document generation and print UI.
- `backend/` — Node.js HTTP API, authentication/session handling, PostgreSQL access, audit/data operations, AI runtime and administration endpoints.
- `config/` — AI agent and skill registries.
- `scripts/` — backup, restore, production verification and recovery drills.
- `tests/` — release, security, lineage, performance and regression checks.
- `docs/` — operational and engineering documentation.

## AI runtime truth

The catalog contains executable specialist profiles and skill configurations. They are not 120 independent hosted AI models. Live model execution depends on configured providers and credentials.

## Deployment boundary

GitHub Pages can host the static frontend. Shared authentication, PostgreSQL storage, imports/exports, audit data, and live AI provider execution require the backend to be deployed and reachable.
