#!/bin/bash
# Shared helpers for the test scripts. Loads the root .env for ports and keys.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$ROOT/.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "$ROOT/.env"; set +a
fi

WEATHER_PORT="${WEATHER_PORT:-3000}"
PACKING_PORT="${PACKING_PORT:-3001}"
WEATHER_BASE="${WEATHER_BASE:-http://localhost:$WEATHER_PORT}"
PACKING_BASE="${PACKING_BASE:-http://localhost:$PACKING_PORT}"
WEATHER_API_KEY="${WEATHER_API_KEY:-weather-dev-key-change-me}"
PACKING_API_KEY="${PACKING_API_KEY:-packing-dev-key-change-me}"

# send <base> <key> <id> <text>
send() {
  curl -s -X POST "$1/a2a" \
    -H 'Content-Type: application/json' \
    -H "x-api-key: $2" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":$3,\"method\":\"message/send\",\"params\":{\"message\":{\"kind\":\"message\",\"role\":\"user\",\"messageId\":\"m$3\",\"parts\":[{\"kind\":\"text\",\"text\":\"$4\"}]}}}"
}
