#!/bin/sh
set -eu

# This candidate is for isolated homologation only. Never migrate on server startup.
if [ "${NODE_ENV:-}" != "development" ] && [ "${NODE_ENV:-}" != "test" ] && ! { [ "${NODE_ENV:-}" = "production" ] && [ "${PERSONA_V2_DEPLOYMENT:-}" = "test-server" ]; }; then
  echo "Candidato persona-v2 bloqueado fora de desenvolvimento/homologação." >&2
  exit 1
fi
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
