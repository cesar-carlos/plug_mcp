#!/bin/bash
# Publicação da main neste host. A chave de deploy só pode executar este arquivo.
set -euo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="${HOME:-/root}"
cd /root/plug_mcp

exec 9>/var/lock/plug-mcp-deploy.lock
if ! flock -n 9; then
  echo "deploy already running" >&2
  exit 1
fi

case "${SSH_ORIGINAL_COMMAND:-deploy}" in
  status)
    curl -fsS --max-time 5 http://127.0.0.1:3333/health
    echo
    exit 0
    ;;
  deploy) ;;
  *)
    echo "command not allowed" >&2
    exit 1
    ;;
esac

git fetch origin main
git pull --ff-only origin main
GIT_SHA="$(git rev-parse --short HEAD)"
export GIT_SHA
docker compose --profile container up --build -d --no-deps mcp

for _ in $(seq 1 40); do
  if curl -fsS --max-time 3 http://127.0.0.1:3333/health; then
    echo
    exit 0
  fi
  sleep 2
done

echo "health check failed" >&2
docker logs --tail 40 plug_mcp-mcp-1 >&2 || true
exit 1
