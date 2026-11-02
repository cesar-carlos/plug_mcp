#!/bin/sh
set -eu

# Migration is always an explicit command.
case "${NODE_ENV:-}/${PERSONA_V2_DEPLOYMENT:-}" in
  development/*|test/*|production/test-server) ;;
  production/clients)
    if [ -e /app/.test-server-only ]; then
      echo "A imagem de teste recusa o destino de clientes." >&2
      exit 1
    fi ;;
  *) echo "Destino persona-v2 inválido." >&2; exit 1 ;;
esac
if [ -z "${DATABASE_URL:-}" ] || [ -z "${MCP_ENCRYPTION_KEY:-}" ]; then
  echo "Candidato exige banco dedicado e chave externa." >&2
  exit 1
fi
if [ "$#" -ne 1 ]; then
  echo "Informe server, worker ou migrate explicitamente." >&2
  exit 1
fi
case "$1" in
  check) exec node dist/check-persona-deployment.js ;;
  server) exec node dist/main-persona-v2.js ;;
  worker) exec node dist/worker-persona-v2.js ;;
  migrate) exec node dist/infrastructure/persistence/persona-v2/migrate.js ;;
  *) echo "Comando de candidato recusado." >&2; exit 1 ;;
esac
