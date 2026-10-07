#!/bin/bash
# Exit 0 when the filenames on stdin include a production runtime path.
set -euo pipefail

found=0
while IFS= read -r file || [ -n "$file" ]; do
  case "$file" in
    src/* | web/* | drizzle/* | docs/mcp/error-mapping.md | Dockerfile | docker-entrypoint.sh | package.json | package-lock.json | docker-compose.yml | .github/workflows/ci.yml | .github/workflows/deploy.yml)
      found=1
      ;;
  esac
done

if [ "$found" -eq 1 ]; then
  exit 0
fi
exit 1
