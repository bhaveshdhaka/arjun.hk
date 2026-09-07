#!/usr/bin/env bash
# Set the asset cache-bust version (?v=) to the current git short SHA.
# Run before every commit+deploy that touches games/ assets.
set -euo pipefail
cd "$(dirname "$0")/.."

SHA=$(git rev-parse --short HEAD)
files="games/index.html games/flags/index.html games/flags/js/quiz.js games/assets/js/engine.js"
for f in $files; do
  sed -i -E "s/\?v=[0-9a-zA-Z]+/?v=$SHA/g" "$f"
done
echo "asset version bumped to ?v=$SHA"
grep -hoE '\?v=[0-9a-zA-Z]+' $files | sort | uniq -c
