# XpressPro FX

A full-stack Forex/crypto trading broker platform with a user-facing trading frontend (NeXTrade) and an admin portal.

## Architecture

| Artifact | Port | Path | Description |
|---|---|---|---|
| `artifacts/api-server` | 8080 | `/api` | Express 5 + Drizzle ORM backend |
| `artifacts/nextrade` | 25849 | `/` | Main user-facing React frontend |
| `artifacts/admin-portal` | 25580 | `/xpadmin/` | Admin React frontend |

All three services run in separate Replit workflows and communicate via the API server.

## Running the project

All workflows are configured and start automatically:

- **API Server**: `artifacts/api-server: API Server` — builds with esbuild then starts on port 8080
- **Main frontend**: `artifacts/nextrade: web` — Vite dev server on port 25849
- **Admin portal**: `artifacts/admin-portal: web` — Vite dev server on port 25580

## Health endpoints

- `GET /api/healthz` — full health check: `{ status, db, dbLatencyMs, uptime, timestamp }` — returns 503 if DB is down
- `GET /healthz` — root alias: `{ status, uptime, timestamp }` — for platforms that probe `/healthz`

## Market data

`GET /api/market/prices` — returns live mid-prices for 18 instruments, refreshed every 30 seconds.
- Forex + commodities: [Frankfurter API](https://www.frankfurter.app/) (free, no key)
- Crypto: [CoinGecko public API](https://docs.coingecko.com/v3.0.1/reference/introduction) (free, no key)
- The NeXTrade frontend polls this endpoint and applies micro-jitter between fetches for a live feel

## Security hardening

The API server includes:
- `helmet()` — comprehensive security headers (HSTS, CSP, X-Frame-Options, etc.)
- `hpp()` — HTTP Parameter Pollution prevention
- `express.json({ limit: '10kb' })` — body size cap
- Global rate limit: 100 req / 15 min / IP (production only)
- Auth rate limit: 10 req / 15 min on login/signup endpoints
- `app.disable('x-powered-by')` — suppress Express header
- `uncaughtException` + `unhandledRejection` handlers
- CORS origin allowlist driven by `ALLOWED_ORIGINS` + `REPLIT_DOMAINS`

## Database

Uses a Neon PostgreSQL database (stored in `DATABASE_URL` secret). Schema lives in `lib/db/src/schema/`. To push schema changes:

```bash
CLEAN_URL=$(echo "$DATABASE_URL" | sed "s/^psql '//;s/'$//")
cd lib/db && DATABASE_URL="$CLEAN_URL" pnpm run push-force
```

> Note: the `DATABASE_URL` secret may have been pasted as `psql '...'`. The API server's `db-client.ts` strips that prefix automatically; shell commands above need it stripped manually.

## Email delivery

The server uses a priority chain: **SendGrid** → **SMTP** → **log-only fallback**.

Set `SENDGRID_API_KEY` in Replit Secrets (already set) and optionally configure `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` as a fallback.

Transactional emails sent: registration confirmation, OTP codes, deposit/withdrawal notifications, admin alerts.

## Required secrets

| Secret | Description |
|---|---|
| `SESSION_SECRET` | Cookie signing secret (64+ random chars) |
| `ADMIN_EMAIL` | Admin portal login email |
| `ADMIN_PASSWORD` | Admin portal login password |
| `DATABASE_URL` | Neon PostgreSQL connection string |

## Optional secrets

| Secret | Description |
|---|---|
| `SENDGRID_API_KEY` | Transactional email (already set) |
| `JWT_SECRET` | JWT signing secret (falls back to SESSION_SECRET in dev) |
| `ALCHEMY_API_KEY` | Live blockchain data (public provider used as fallback) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | AI assistant / live chat |
| `MOONPAY_API_KEY` + `MOONPAY_SECRET_KEY` + `MOONPAY_WEBHOOK_SECRET` | Buy crypto |

## Deployment

### Railway
Configure in Railway dashboard:
- Build command: `npm install -g pnpm@9 && pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server build`
- Start command: `node artifacts/api-server/dist/index.mjs`
- Health check path: `/api/healthz`
- Set all required secrets as Railway environment variables
- Set `ALLOWED_ORIGINS=https://yourdomain.com` for CORS

See `railway.json` and `railpack.json` for the full config.

### VPS (Ubuntu/Debian + PM2)
```bash
# 1. Clone repo, set up .env from .env.example
# 2. Run the deploy script:
./deploy.sh
# 3. Set up nginx reverse proxy:
sudo cp nginx.conf /etc/nginx/sites-available/xpressprofx
sudo ln -s /etc/nginx/sites-available/xpressprofx /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
sudo nginx -t && sudo systemctl reload nginx
```

## User preferences

<!-- Add user preferences here -->
