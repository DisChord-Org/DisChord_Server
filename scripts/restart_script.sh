#!/usr/bin/env bash
# -E: sin errtrace el trap ERR no salta dentro de funciones, y todo vive en main().
set -Eeuo pipefail

# todo dentro de main() para que las variables locales no se filtren al entorno del shell padre.
main() {
    export PATH="$HOME/.local/share/pnpm:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

    local TAG="${1:?Uso: restart_script.sh <tag>}"
    local CHANNEL_ID="1031279210687385640"
    local LOG_FILE="$HOME/.dischord_deploy.log"

    exec >> "$LOG_FILE" 2>&1
    echo "=== Deploy $TAG $(date -Is) ==="

    if ! [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
        echo "Tag inválido: $TAG (se esperaba vX.Y.Z)."
        return 1
    fi

    cd "$(dirname "$0")/.."

    exec 9> .deploy.lock
    flock -n 9 || { echo "Ya hay un despliegue en curso."; return 0; }

    notify() {
        local token
        token="$(grep -E '^BOT_TOKEN=' .env | head -n1 | cut -d= -f2- | tr -d '"'"'" || true)"
        [ -n "$token" ] || return 0
        curl -sS -X POST "https://discord.com/api/v10/channels/$CHANNEL_ID/messages" \
            -H "Authorization: Bot $token" -H "Content-Type: application/json" \
            -d "{\"content\":\"$1\"}" || true
    }

    notify_failure() {
        notify "-# Falló el despliegue de \`$TAG\`. Revisa \`$LOG_FILE\`. El servidor sigue en la versión anterior."
    }

    local PREVIOUS
    PREVIOUS="$(git rev-parse HEAD)"
    rollback() {
        trap - ERR
        set +e
        echo "Fallo: volviendo a $PREVIOUS"
        git checkout --force "$PREVIOUS"
        pnpm install --frozen-lockfile --ignore-scripts || echo "Rollback: falló pnpm install."
        pnpm build || echo "Rollback: falló pnpm build."
        notify_failure
        exit 1
    }
    trap rollback ERR

    git fetch --tags --force origin
    git checkout --force "tags/$TAG"
    pnpm install --frozen-lockfile --ignore-scripts
    pnpm build

    trap - ERR
    if ! pm2 restart server; then
        echo "Falló pm2 restart server."
        notify_failure
        return 1
    fi

    local url="http://127.0.0.1:${PORT:-45350}/versions"
    local i
    for i in $(seq 1 15); do
        if curl -fsS --max-time 3 "$url" > /dev/null; then
            echo "Health check correcto ($url)."
            return 0
        fi
        sleep 2
    done

    echo "Health check fallido tras ~30 s: $url no responde."
    notify "-# \`$TAG\` reiniciado pero no responde. Revisa \`$LOG_FILE\` y los logs de pm2."
    return 1
}

main "$@"; exit $?
