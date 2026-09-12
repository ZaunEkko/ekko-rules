#!/usr/bin/env sh
# Pull-based deploy for a server running the self-hosted converter.
#
# Nothing outside this machine can trigger it: the server checks the registry
# and restarts only when an image actually changed. Run it from a systemd timer
# (see docs/vps.md) or by hand.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

COMPOSE_FILES="-f compose.yaml -f compose.ghcr.yaml"

if [ ! -f "$ROOT/.env" ]; then
  echo "Missing $ROOT/.env; copy .env.vps.example first." >&2
  exit 1
fi

# A server that silently falls back to the stored-profile shape would start
# keeping visitors' subscriptions on a public box. Refuse instead: the default
# exists so that a bare `docker compose up` on someone's own computer is the
# personal one, not so that a deploy can forget to say which it wants.
if ! grep -qE "^[[:space:]]*SELFHOST_MODE[[:space:]]*=[[:space:]]*(lan|public)[[:space:]]*$" "$ROOT/.env"; then
  echo "$ROOT/.env must set SELFHOST_MODE to lan or public." >&2
  exit 1
fi

current_images() {
  # shellcheck disable=SC2086
  docker compose $COMPOSE_FILES images --quiet 2>/dev/null | sort
}

before=$(current_images || true)

# shellcheck disable=SC2086
docker compose $COMPOSE_FILES pull --quiet

after_pull=$(docker compose $COMPOSE_FILES config --images 2>/dev/null || true)
if [ -n "$after_pull" ]; then
  for image in $after_pull; do
    docker image inspect "$image" >/dev/null 2>&1 || {
      echo "Image $image is unavailable after pull." >&2
      exit 1
    }
  done
fi

# shellcheck disable=SC2086
docker compose $COMPOSE_FILES up -d --remove-orphans

after=$(current_images || true)
if [ "$before" = "$after" ]; then
  echo "Already up to date."
else
  echo "Updated."
  docker image prune -f >/dev/null 2>&1 || true
fi

# A deploy that leaves the service unhealthy is worse than no deploy: say so
# loudly enough for the timer's journal to show it. `State` reaches "running"
# before the healthcheck has said anything and stays there afterwards, so the
# health column is the one that answers "can this thing actually convert".
attempt=0
while [ "$attempt" -lt 45 ]; do
  status=$(docker compose $COMPOSE_FILES ps --format "{{.Service}} {{.State}} {{.Health}}" 2>/dev/null || true)
  case "$status" in
    *"web running healthy"*) echo "$status"; exit 0 ;;
    *"web running unhealthy"*) break ;;
  esac
  attempt=$((attempt + 1))
  sleep 2
done

echo "web did not become healthy after the update." >&2
docker compose $COMPOSE_FILES logs --tail=50 web >&2 || true
exit 1
