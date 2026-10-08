#!/usr/bin/env bash
set -euo pipefail

exec >> /tmp/dischord_deploy.log 2>&1
echo "=== Deploy $(date -Is) ==="

cd "$(dirname "$0")/.."

git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm build
pm2 restart server
