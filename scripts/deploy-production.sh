#!/bin/bash
# Root-owned forced SSH command, installed outside the checkout. Reject legacy protocol.
set -euo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
umask 077
readonly repository=/root/plug_mcp
readonly settings=/etc/se7e/persona-v2-test.env
exec 9>/var/lock/plug-mcp-deploy.lock
flock -n 9 || { echo 'Another deployment is active.' >&2; exit 1; }
read -r action revision image hash extra <<<"${SSH_ORIGINAL_COMMAND:-}"
if [ "${action:-}" != deploy-test ] || [ -n "${extra:-}" ] ||
   ! [[ "${revision:-}" =~ ^[a-f0-9]{40}$ ]] ||
   ! [[ "${image:-}" =~ ^sha256:[a-f0-9]{64}$ ]] ||
   ! [[ "${hash:-}" =~ ^[a-f0-9]{64}$ ]]; then
  echo 'Only deploy-test with exact revision, image ID and archive hash is allowed.' >&2
  exit 1
fi
cd "$repository"
git fetch origin main >&2
git merge-base --is-ancestor "$revision" origin/main
release=$(mktemp -d /var/tmp/se7e-persona-test.XXXXXXXX)
readonly release
# The archive is transport-only. Keep the workspace/Compose files for recovery,
# including on failure, but never retain the large upload after this attempt.
cleanup_archive() {
  local status=$?
  trap - EXIT
  if [ -f "$release/image.tar" ] && [ ! -L "$release/image.tar" ]; then
    if ! rm -- "$release/image.tar"; then
      echo 'Could not remove deployment transport archive.' >&2
      if [ "$status" -eq 0 ]; then status=1; fi
    fi
  fi
  exit "$status"
}
trap cleanup_archive EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
# Never stash or change the server checkout.
echo "Test deployment workspace: $release" >&2
git archive "$revision" | tar -x -C "$release"
cd "$release"
head -c 17179869185 > image.tar
node scripts/check-node-version.mjs
node scripts/deploy-persona-test.mjs "$revision" "$image" "$hash" "$release/image.tar" "$settings"
# No automatic rollback or retry after migrations/effects.
