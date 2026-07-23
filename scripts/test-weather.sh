#!/bin/bash
# Smoke test for the weather agent.
set -u
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

echo "== Weather agent: $WEATHER_BASE"; echo

echo "== 1. Health (no auth)"
curl -s "$WEATHER_BASE/health"; echo; echo

echo "== 2. Agent card (no auth)"
curl -s "$WEATHER_BASE/.well-known/agent-card.json"; echo; echo

echo "== 3. message/send without key (expect 401)"
curl -s -X POST "$WEATHER_BASE/a2a" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"kind":"message","role":"user","messageId":"m1","parts":[{"kind":"text","text":"Boston, MA"}]}}}'
echo; echo

echo "== 4. Boston, MA"
send "$WEATHER_BASE" "$WEATHER_API_KEY" 2 "Boston, MA"; echo; echo

echo "== 5. Unparseable input (expect input-required)"
send "$WEATHER_BASE" "$WEATHER_API_KEY" 3 "tell me about the moon"; echo
