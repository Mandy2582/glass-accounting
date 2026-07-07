#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/arjun_glass_house}"

if [ ! -d "$APP_DIR" ]; then
  echo "App directory not found: $APP_DIR"
  echo "Clone the repository there first, or set APP_DIR=/path/to/app"
  exit 1
fi

cd "$APP_DIR"

if [ ! -f ".env.production" ]; then
  echo "Missing .env.production in $APP_DIR"
  echo "Copy deploy/bigrock/.env.production.example to .env.production and fill values."
  exit 1
fi

git pull --ff-only || true
npm ci
npm run build

cp deploy/bigrock/ecosystem.config.cjs ./ecosystem.config.cjs

pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

echo "App deployed. Check: pm2 status arjun-glass-house"

