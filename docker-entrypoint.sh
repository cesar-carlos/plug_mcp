#!/bin/sh
set -e

if [ -n "${DATABASE_URL:-}" ]; then
  node dist/infrastructure/persistence/migrate.js
fi

exec node dist/main.js
