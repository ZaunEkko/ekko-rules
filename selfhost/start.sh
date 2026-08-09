#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
RUNTIME_DIR="$ROOT/.runtime"
PID_PATH="$RUNTIME_DIR/lan-watcher.pid"
WEB_PORT_VALUE=${WEB_PORT:-8787}

if [ -f "$ROOT/.env" ]; then
  ENV_PORT=$(sed -n 's/^[[:space:]]*WEB_PORT[[:space:]]*=[[:space:]]*\([0-9][0-9]*\)[[:space:]]*$/\1/p' "$ROOT/.env" | tail -n 1)
  if [ -n "$ENV_PORT" ]; then WEB_PORT_VALUE=$ENV_PORT; fi
fi

case "$WEB_PORT_VALUE" in
  ''|*[!0-9]*) echo "WEB_PORT must be an integer." >&2; exit 1 ;;
esac
if [ "$WEB_PORT_VALUE" -lt 1 ] || [ "$WEB_PORT_VALUE" -gt 65535 ]; then
  echo "WEB_PORT must be between 1 and 65535." >&2
  exit 1
fi

mkdir -p "$RUNTIME_DIR"

detect_lan_ip() {
  case "$(uname -s)" in
    Darwin)
      interface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')
      [ -n "$interface" ] || return 1
      ipconfig getifaddr "$interface"
      ;;
    Linux)
      ip -4 route get 1.1.1.1 2>/dev/null |
        awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }'
      ;;
    *) return 1 ;;
  esac
}

write_lan_address() {
  ipv4=$(detect_lan_ip)
  [ -n "$ipv4" ] || return 1
  updated_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  printf '{"ipv4":"%s","baseUrl":"http://%s:%s","updatedAt":"%s","source":"host-default-route"}' \
    "$ipv4" "$ipv4" "$WEB_PORT_VALUE" "$updated_at" > "$RUNTIME_DIR/lan-address.json"
  printf '%s' "$ipv4"
}

run_lan_watcher() {
  cleanup_lan_watcher() {
    recorded_pid=$(cat "$PID_PATH" 2>/dev/null || true)
    if [ "$recorded_pid" = "$$" ]; then
      rm -f "$PID_PATH"
    fi
  }
  trap cleanup_lan_watcher EXIT
  trap 'exit 0' INT TERM
  stopped_checks=0
  while :; do
    if ! write_lan_address >/dev/null 2>&1; then
      rm -f "$RUNTIME_DIR/lan-address.json"
    fi
    if [ "$(docker inspect --format '{{.State.Running}}' ekko-selfhost-web-1 2>/dev/null || true)" = "true" ]; then
      stopped_checks=0
    else
      stopped_checks=$((stopped_checks + 1))
      [ "$stopped_checks" -lt 6 ] || break
    fi
    sleep 5
  done
}

if [ "${1:-}" = "--watch-lan" ]; then
  run_lan_watcher
  exit 0
fi

DETECTED_IP=""
if ! DETECTED_IP=$(write_lan_address); then
  rm -f "$RUNTIME_DIR/lan-address.json"
  printf '%s\n' 'LAN IP detection is not available yet; Compose will still start.' >&2
fi

cd "$ROOT"
docker compose up --build -d

watcher_is_running() {
  [ -f "$PID_PATH" ] || return 1
  watcher_pid=$(awk 'NR == 1 { print $1 }' "$PID_PATH" 2>/dev/null)
  case "$watcher_pid" in
    ''|*[!0-9]*) return 1 ;;
  esac
  kill -0 "$watcher_pid" 2>/dev/null || return 1
  case "$(uname -s)" in
    Linux)
      watcher_command=$(tr '\000' ' ' < "/proc/$watcher_pid/cmdline" 2>/dev/null || true)
      ;;
    Darwin)
      watcher_command=$(ps -p "$watcher_pid" -o command= 2>/dev/null || true)
      ;;
    *) return 1 ;;
  esac
  case "$watcher_command" in
    *start.sh*--watch-lan*|*watch-lan-ip.ps1*) return 0 ;;
    *) return 1 ;;
  esac
}

if watcher_is_running; then
  :
else
  sh "$ROOT/start.sh" --watch-lan >/dev/null 2>&1 &
  printf '%s\n' "$!" > "$PID_PATH"
fi

printf '\nEkko Rules is ready:\n'
printf '  Computer: http://localhost:%s\n' "$WEB_PORT_VALUE"
if [ -n "$DETECTED_IP" ]; then
  printf '  Trusted LAN: http://%s:%s\n\n' "$DETECTED_IP" "$WEB_PORT_VALUE"
else
  printf '  Trusted LAN: waiting for an active network\n\n'
fi
printf 'The LAN address watcher will refresh automatically when the network changes.\n'
