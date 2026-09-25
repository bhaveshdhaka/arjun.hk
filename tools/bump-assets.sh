#!/usr/bin/env bash
# Set the asset cache-bust version (?v=) to a timestamp. Run before EVERY
# commit+deploy that touches games/ assets — Cloudflare caches .js/.css by
# extension, so unchanged URLs would serve stale content.
set -euo pipefail
cd "$(dirname "$0")/.."

V=$(date +%m%d%H%M)
for f in games/menu/js/menu.js games/menu/js/admin.js; do
  sed -i -E "s|from '\./clock\.js(\?v=[0-9a-zA-Z]+)?'|from './clock.js?v=$V'|g" "$f"
done

files="index.html admin.html games/index.html games/flags/index.html games/flags/js/quiz.js games/flags/stats.html games/assets/js/engine.js games/menu/js/menu.js games/menu/js/admin.js games/menu/js/clock.js"
for f in $files; do
  sed -i -E "s/\?v=[0-9a-zA-Z]+/?v=$V/g" "$f"
done
echo "asset version bumped to ?v=$V"
grep -hoE '\?v=[0-9a-zA-Z]+' $files | sort | uniq -c
