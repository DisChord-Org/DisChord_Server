#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.local/share/pnpm:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

TAG="${1:?Uso: restart_script.sh <tag>}"
CHANNEL_ID="1031279210687385640"
LOG_FILE="$HOME/.dischord_deploy.log"

exec >> "$LOG_FILE" 2>&1
echo "=== Deploy $TAG $(date -Is) ==="

cd "$(dirname "$0")/.."

exec 9> .deploy.lock
flock -n 9 || { echo "Ya hay un despliegue en curso."; exit 0; }

notify_failure() {
    local token
    token="$(grep -E '^BOT_TOKEN=' .env | head -n1 | cut -d= -f2- | tr -d '"'"'" || true)"
    [ -n "$token" ] || return 0
    curl -sS -X POST "https://discord.com/api/v10/channels/$CHANNEL_ID/messages" \
        -H "Authorization: Bot $token" -H "Content-Type: application/json" \
        -d "{\"content\":\"-# Falló el despliegue de \`$TAG\`. Revisa \`$LOG_FILE\`. El servidor sigue en la versión anterior.\"}" || true
}

PREVIOUS="$(git rev-parse HEAD)"
rollback() {
    echo "Fallo: volviendo a $PREVIOUS"
    git checkout --force "$PREVIOUS" || true
    notify_failure
}
trap rollback ERR

git fetch --tags --force origin
git checkout --force "tags/$TAG"
pnpm install --frozen-lockfile
pnpm build

trap - ERR
pm2 restart server
