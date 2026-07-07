# XpressPro FX

A full-stack Forex/crypto trading broker platform (NeXTrade) with an admin portal.

## Architecture

| Artifact | Port | Path | Description |
|---|---|---|---|
| `artifacts/api-server` | 8080 | `/api` | Express + Drizzle ORM backend |
| `artifacts/nextrade` | 25849 | `/` | Main user-facing React frontend |
| `artifacts/admin-portal` | 25580 | `/xpadmin/` | Admin React frontend |

All three services run in separate Replit workflows and communicate via the API.

## Running the project

All workflows are configured and start automatically:

- **API Server**: `artifacts/api-server: API Server` — builds then starts on port 8080
- **Main frontend**: `artifacts/nextrade: web` — Vite dev server on port 25849
- **Admin portal**: `artifacts/admin-portal: web` — Vite dev server on port 25580

## Database

Uses a Neon PostgreSQL database (stored in `DATABASE_URL` secret). The schema lives in `lib/db/src/schema/`. To push schema changes:

```bash
CLEAN_URL=$(echo "$DATABASE_URL" | sed "s/^psql '//;s/'$//")
cd lib/db && DATABASE_URL="$CLEAN_URL" pnpm run push-force
```

> Note: the `DATABASE_URL` secret was historically pasted as a full `psql '...'` command. The API server's `db-client.ts` automatically strips that prefix, but the shell commands above need it stripped manually.

## Required secrets

| Secret | Description |
|---|---|
| `SESSION_SECRET` | Cookie signing secret |
| `ADMIN_EMAIL` | Admin portal login email |
| `ADMIN_PASSWORD` | Admin portal login password |
| `DATABASE_URL` | Neon PostgreSQL connection string (paste just the URL, not the psql command) |

## Optional secrets

| Secret | Description |
|---|---|
| `SENDGRID_API_KEY` | Transactional email |
| `ALCHEMY_API_KEY` | Live blockchain data |
| `OPENAI_API_KEY` | AI assistant |
| `MOONPAY_API_KEY` + `MOONPAY_SECRET_KEY` | Buy crypto feature |

## User preferences

<!-- Add user preferences here -->
