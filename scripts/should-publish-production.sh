#!/bin/bash
# Exit 0 when the filenames on stdin include a production runtime path.
set -euo pipefail

found=0
while IFS= read -r file || [ -n "$file" ]; do
  case "$file" in
    src/* | web/* | drizzle/* | migrations/* | contracts/persona-v2-release.json | scripts/check-persona-release.mjs | scripts/persona-release-evidence.mjs | scripts/tested-image.mjs | scripts/accepted-image-origin.mjs | scripts/check-persona-production-config.ts | docs/mcp/error-mapping.md | Dockerfile | docker-entrypoint.sh | docker-entrypoint-persona-v2.sh | package.json | package-lock.json | docker-compose.yml | docker-compose.persona-v2*.yml | .github/workflows/ci.yml | .github/workflows/deploy.yml)
      found=1
      ;;
    scripts/persona-production.ts | scripts/check-persona-test-deploy.mjs | scripts/deploy-persona-test.mjs | scripts/deploy-production.sh | contracts/persona-v2-test-deploy.json)
      found=1
      ;;
  esac
done

if [ "$found" -eq 1 ]; then
  exit 0
fi
exit 1
