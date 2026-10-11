# AI-Syed Jalal — Online Production Deployment

Architecture: one HTTPS origin, Caddy reverse proxy, private API, private PostgreSQL.

- `/` → frontend
- `/api/*` → API
- PostgreSQL → internal Docker network only
- API port 8787 → internal Docker network only
- Caddy → public 80/443 with automatic HTTPS

## Requirements
- Linux VPS
- Docker Engine + Compose plugin
- Domain DNS A/AAAA record pointing to the VPS
- TCP 80/443 open

## Deploy
1. Copy the full project to the VPS.
2. Copy `.env.production.example` to `.env.production`.
3. Set `PUBLIC_ORIGIN=https://your-domain.example` and strong secrets.
4. Add required AI provider keys.
5. Run `./deploy.sh`.

Caddy will obtain and renew HTTPS automatically when DNS is correct.

## Verify
`docker compose --env-file .env.production -f docker-compose.production.yml ps`
`curl -fsS "$PUBLIC_ORIGIN/api/health"`
`curl -fsS "$PUBLIC_ORIGIN/api/ready"`

Never expose PostgreSQL or port 8787 publicly. Never commit `.env.production` or API keys.
