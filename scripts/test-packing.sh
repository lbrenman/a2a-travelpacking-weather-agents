#!/bin/bash
# Smoke test for the packing agent.
set -u
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

echo "== Packing agent: $PACKING_BASE"; echo

echo "== 1. Health — check .mode and .dependencies.weatherAgent"
curl -s "$PACKING_BASE/health"; echo; echo

echo "== 2. Agent card — the forecast-aware skill appears only when a"
echo "==    weather agent is configured"
curl -s "$PACKING_BASE/.well-known/agent-card.json"; echo; echo

echo "== 3. message/send without key (expect 401)"
curl -s -X POST "$PACKING_BASE/a2a" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"kind":"message","role":"user","messageId":"m1","parts":[{"kind":"text","text":"Boston, MA"}]}}}'
echo; echo

echo "== 4. Boston, MA for 5 days"
send "$PACKING_BASE" "$PACKING_API_KEY" 2 "Boston, MA for 5 days"; echo; echo

echo "== 5. a week in Portland, OR"
send "$PACKING_BASE" "$PACKING_API_KEY" 3 "a week in Portland, OR"; echo; echo

echo "== Tip: metadata.mode is 'enriched' if the weather agent answered,"
echo "==      'standalone' if it did not."
