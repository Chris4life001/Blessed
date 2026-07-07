#!/bin/bash
# XpressPro FX — VPS deployment script
# Run from the project root on your server.
# Prerequisites: Node 20+, pnpm 9+, PM2

set -euo pipefail

echo "╔══════════════════════════════════════════╗"
echo "║    XpressPro FX — Production Deploy      ║"
echo "╚══════════════════════════════════════════╝"

# ── Verify required tools ────────────────────────────────────────────────────
command -v node  >/dev/null 2>&1 || { echo "ERROR: node not found. Install Node 20+."; exit 1; }
command -v pnpm  >/dev/null 2>&1 || { echo "ERROR: pnpm not found. Run: npm install -g pnpm"; exit 1; }
command -v pm2   >/dev/null 2>&1 || { echo "ERROR: pm2 not found. Run: npm install -g pm2"; exit 1; }

# ── Verify required env vars ─────────────────────────────────────────────────
REQUIRED_VARS=("NODE_ENV" "DATABASE_URL" "SESSION_SECRET" "ADMIN_EMAIL" "ADMIN_PASSWORD")
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: Required environment variable $var is not set."
    echo "       Set it in your .env file or export it before running this script."
    exit 1
  fi
done

echo ""
echo "▶ Step 1/5 — Pulling latest code..."
git pull origin main

echo ""
echo "▶ Step 2/5 — Installing dependencies..."
pnpm install --frozen-lockfile

echo ""
echo "▶ Step 3/5 — Pushing database schema..."
cd lib/db
DATABASE_URL="$DATABASE_URL" pnpm run push-force
cd ../..

echo ""
echo "▶ Step 4/5 — Building API server..."
pnpm --filter @workspace/api-server build

echo ""
echo "▶ Step 5/5 — Restarting PM2..."
mkdir -p logs
pm2 reload ecosystem.config.js --env production --update-env || pm2 start ecosystem.config.js --env production
pm2 save

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Monitor with: pm2 logs xpresspro-fx"
echo "Status:       pm2 status"
echo "Health check: curl http://localhost:8080/api/healthz"
