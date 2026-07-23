#!/bin/bash
# Demonstrates graceful degradation: shows the packing agent's mode, and
# compares its answer with the weather agent reachable vs not.
#
# Run this while BOTH agents are up, then stop the weather agent and run it
# again — the packing agent still returns a complete list.
set -u
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

echo "== Is the weather agent up?"
if curl -sf -o /dev/null --max-time 3 "$WEATHER_BASE/health"; then
  echo "   YES — expect mode=enriched"
else
  echo "   NO  — expect mode=standalone, and still a full packing list"
fi
echo

echo "== Packing agent health"
curl -s "$PACKING_BASE/health"; echo; echo

echo "== Packing response (text part only)"
send "$PACKING_BASE" "$PACKING_API_KEY" 9 "Boston, MA for 5 days" \
  | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try{
    const t=JSON.parse(d).result;
    console.log('mode:', t.metadata?.mode, '\n');
    console.log(t.artifacts[0].parts[0].text);
  }catch(e){ console.log(d); }
});"
echo
