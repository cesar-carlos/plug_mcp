#!/bin/bash
# Source reviewed in git. The SSH key runs /usr/local/sbin/plug-mcp-deploy,
# a root-owned copy that git pull cannot replace.
set -euo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="${HOME:-/root}"

IMAGE_REPO="ghcr.io/cesar-carlos/plug_mcp"
LOG=/var/log/plug-mcp-deploy.log

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG" >&2
}

image_ref() {
  printf '%s:%s' "$IMAGE_REPO" "$1"
}

wait_ready() {
  local _ health ready
  for _ in $(seq 1 40); do
    health="$(curl -fsS --max-time 3 http://127.0.0.1:3333/health 2>/dev/null || true)"
    ready="$(curl -fsS --max-time 5 http://127.0.0.1:3333/ready 2>/dev/null || true)"
    if [ -n "$health" ] && [ -n "$ready" ]; then
      printf '%s\n%s\n' "$health" "$ready"
      return 0
    fi
    sleep 2
  done
  return 1
}

cd /root/plug_mcp
exec 9>/var/lock/plug-mcp-deploy.lock
if ! flock -n 9; then
  log "deploy already running"
  exit 1
fi

read -r action sha extra <<<"${SSH_ORIGINAL_COMMAND:-}"
case "${action:-}" in
  status)
    wait_ready
    exit 0
    ;;
  deploy) ;;
  *)
    log "command not allowed"
    exit 1
    ;;
esac

if [ -n "${extra:-}" ] || ! [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  log "deploy requires the 40-character commit that passed CI"
  exit 1
fi

prev_id="$(docker inspect -f '{{.Image}}' plug_mcp-mcp-1 2>/dev/null || true)"
prev_sha="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' plug_mcp-mcp-1 2>/dev/null | sed -n 's/^GIT_SHA=//p' | head -1 || true)"

rollback() {
  if [ -z "$prev_id" ]; then
    log "no previous image to restore"
    return
  fi
  local tag="${prev_sha:-rollback}"
  if ! [[ "$tag" =~ ^[A-Za-z0-9_.-]{1,128}$ ]]; then
    tag="rollback"
  fi
  docker tag "$prev_id" "$(image_ref "$tag")"
  GIT_SHA="$tag" docker compose --profile container up -d --no-deps --no-build --pull never mcp || true
  if wait_ready >/dev/null; then
    log "rolled back to ${tag}"
  else
    log "rollback did not become ready"
  fi
}

fail() {
  log "publish failed: $1"
  docker logs --tail 40 plug_mcp-mcp-1 >&2 || true
  rollback
  exit 1
}

log "publishing ${sha}"
stashed=0
if [ -n "$(git status --porcelain)" ]; then
  git stash push -u -m "plug-mcp-deploy ${sha}"
  stashed=1
fi
restore_stash() {
  if [ "$stashed" -eq 1 ]; then
    git stash pop || log "local changes kept in git stash"
  fi
}
trap restore_stash EXIT
git fetch origin main
git cat-file -e "${sha}^{commit}"
git checkout --force -B main "$sha"

if ! docker load; then
  fail "docker load failed"
fi

export GIT_SHA="$sha"
if ! docker compose --profile container up -d --no-deps --no-build --pull never mcp; then
  fail "compose up failed"
fi

if ! wait_ready; then
  fail "health or ready check failed"
fi
log "published ${sha}"
