# V76 Deployment Ready Guide

## Windows PC
1. Install Windows 10/11 with PowerShell 5.1+ and enable App Installer/winget.
2. Recommended: install Docker Desktop and reboot if requested.
3. Run PowerShell as Administrator if Docker installation/setup requires it.
4. Execute:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\windows\setup.ps1
```

5. Verify:

```powershell
.\deploy\windows\verify.ps1
```

If Docker Desktop is unavailable, install PostgreSQL 16 and Node.js 20+ and rerun; the script can use direct PostgreSQL mode when `psql` is available and `.env` contains a valid `DATABASE_URL`.

## Linux VPS
Install Docker Engine + Compose plugin, then:

```bash
./deploy/linux/setup.sh
E2E_PASSWORD='your-seeded-admin-password' ./deploy/linux/verify.sh
```

## Live AI
Set one or more provider keys in `.env`:

- `GEMINI_API_KEY`
- `DEEPSEEK_API_KEY`
- `OPENAI_API_KEY`
- `OMNIROUTE_KEY`

Then:

```bash
RUN_AI_E2E=1 E2E_PASSWORD='...' ./deploy/linux/verify.sh
```

For fallback verification configure two providers and the corresponding E2E provider/fallback variables documented by `tests/ai-live-e2e.mjs`.

## Browser E2E
Install Chrome/Chromium and set `CHROMIUM` if needed. Then:

```bash
RUN_BROWSER_E2E=1 E2E_PASSWORD='...' ./deploy/linux/verify.sh
```

## Security
- Never commit `.env`.
- Use strong unique DB/admin/auth/CSRF secrets.
- For HTTPS production, set `CORS_ORIGIN` to the real HTTPS frontend origin and `SESSION_COOKIE_SECURE=true`.
- Put the web/API behind TLS and a firewall/reverse proxy on a public VPS.
