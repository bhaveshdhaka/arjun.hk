#!/usr/bin/env bash
# arjun.hk static-site validation. CI runs this same script.
set -euo pipefail

# Validate root index.html
test -s index.html && echo "index.html present and non-empty"
grep -q "</html>" index.html && echo "html closes properly"
for img in $(grep -oE 'src="[^"]+\.(png|jpg|jpeg|svg|webp)"' index.html | sed -E 's/.*src="([^"]+)"/\1/' | sort -u); do
  test -f "$img" || { echo "MISSING asset: $img"; exit 1; }
done

# Validate every page under games/
shopt -s nullglob
pages=$(find games -name '*.html' 2>/dev/null)
if [ -z "$pages" ]; then
  echo "no games pages found (skipping)"
else
  for f in $pages; do
    test -s "$f" || { echo "EMPTY page: $f"; exit 1; }
    grep -q "</html>" "$f" || { echo "page does not close: $f"; exit 1; }
    dir=$(dirname "$f")
    for ref in $(grep -oE '(src|href)="[^"]+"' "$f" | sed -E 's/.*="([^"]+)"/\1/' | grep -vE '^(https?:|//|#|mailto:)' | grep -v '\$\{'); do
      p="${ref%%\?*}"; p="${p%%#*}"
      case "$p" in /*) target=".$p" ;; *) target="$dir/$p" ;; esac
      test -e "$target" || { echo "MISSING asset: $ref (referenced in $f)"; exit 1; }
    done
    echo "page OK: $f"
  done
fi

# Data integrity: countries <-> flag files, duplicates, regions
if command -v node >/dev/null 2>&1; then
  node tools/validate-data.mjs
  node tools/test-quiz.mjs
else
  echo "node not available — skipped data check"
fi

echo "static validation OK"
