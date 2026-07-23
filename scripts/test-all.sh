#!/bin/bash
# Runs both smoke tests.
set -u
DIR="$(dirname "${BASH_SOURCE[0]}")"
bash "$DIR/test-weather.sh"
echo
echo "============================================================"
echo
bash "$DIR/test-packing.sh"
