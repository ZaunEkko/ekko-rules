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
REPO=$(CDPATH= cd -- "$ROOT/.." && pwd)
UNIT_DIR=/etc/systemd/system
SELF="$ROOT/scripts/vps-update.sh"

fingerprint() {
  [ -f "$1" ] && cksum <"$1" || echo missing
}

# Images are not the only thing a deploy carries. systemd units, compose files
# and nginx snippets live in the repository too, and before this the checkout
# was only ever updated by hand — one server sat eleven commits behind and kept
# running a timer interval that had been changed weeks earlier.
#
# Pulling is best-effort on purpose: the image update is the job, and a network
# blip or a branch someone is debugging on must not stop it.
sync_repo() {
  command -v git >/dev/null 2>&1 || return 0
  [ -d "$REPO/.git" ] || return 0

  branch=$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [ "$branch" != "main" ]; then
    echo "Checkout is on ${branch:-an unknown ref}, not main; leaving it alone."
    return 0
  fi
  if [ -n "$(git -C "$REPO" status --porcelain 2>/dev/null)" ]; then
    echo "Checkout has local changes; leaving it alone."
    return 0
  fi
  if ! git -C "$REPO" pull --ff-only --quiet 2>/dev/null; then
    echo "Could not fast-forward the checkout; continuing with what is on disk." >&2
  fi
}

# The timer carries no machine-specific path, so a changed one is always safe to
# install. The service file hardcodes /opt/ekko-rules/selfhost, so it is only
# replaced when the installed copy already points at this checkout — a server
# that put the repository somewhere else edited that line, and silently
# overwriting it would point the unit at a directory that does not exist.
sync_units() {
  [ -d "$UNIT_DIR" ] || return 0
  command -v systemctl >/dev/null 2>&1 || return 0
  # Run by hand as an ordinary user, this directory is not writable. Skipping is
  # right: that invocation is someone checking on the containers, not a deploy.
  [ -w "$UNIT_DIR" ] || return 0
  reload=0
  timer_changed=0

  src="$ROOT/systemd/ekko-selfhost-update.timer"
  if [ -f "$src" ] && ! cmp -s "$src" "$UNIT_DIR/ekko-selfhost-update.timer"; then
    cp "$src" "$UNIT_DIR/ekko-selfhost-update.timer"
    echo "Installed a changed ekko-selfhost-update.timer."
    reload=1
    timer_changed=1
  fi

  src="$ROOT/systemd/ekko-selfhost-update.service"
  installed="$UNIT_DIR/ekko-selfhost-update.service"
  if [ -f "$src" ] && ! cmp -s "$src" "$installed"; then
    if grep -qx "WorkingDirectory=$ROOT" "$installed" 2>/dev/null; then
      cp "$src" "$installed"
      echo "Installed a changed ekko-selfhost-update.service."
      reload=1
    else
      echo "ekko-selfhost-update.service differs but the installed copy was adapted for this server; not overwriting it." >&2
    fi
  fi

  [ "$reload" -eq 1 ] || return 0
  systemctl daemon-reload || true
  # Restarting the timer from inside the service it activated is safe: this
  # service is oneshot and keeps running, only the schedule is rearmed.
  [ "$timer_changed" -eq 1 ] && systemctl restart ekko-selfhost-update.timer || true
}

before_self=$(fingerprint "$SELF")
sync_repo
# A shell reads a script as it runs, so continuing inside a file that just
# changed underneath is how a deploy corrupts itself. Hand over to the new copy
# instead, once.
if [ "${EKKO_UPDATE_REEXEC:-}" != "1" ] && [ "$(fingerprint "$SELF")" != "$before_self" ]; then
  if [ -x "$SELF" ]; then
    echo "The update script changed; handing over to the new copy."
    export EKKO_UPDATE_REEXEC=1
    exec "$SELF" "$@"
  fi
  echo "The update script changed but is not executable; this run continues on the old copy." >&2
fi
sync_units

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
