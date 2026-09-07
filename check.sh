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
    for ref in $(grep -oE '(src|href)="[^"]+"' "$f" | sed -E 's/.*="([^"]+)"/\1/' | grep -vE '^(https?:|//|#|mailto:)' | grep -v -F '${'); do
      p="${ref%%\?*}"; p="${p%%#*}"
      case "$p" in /*) target=".$p" ;; *) target="$dir/$p" ;; esac
      test -e "$target" || { echo "MISSING asset: $ref (referenced in $f)"; exit 1; }
    done
    echo "page OK: $f"
  done
fi

# Runtime-generated links inside JS modules: JS renders href/src into pages,
# so targets must be checked against every page directory (relative context).
# NOTE: every grep gets `|| true` — an empty match set is normal, not an error.
for j in $(find games -name '*.js' 2>/dev/null); do
  refs=$( (grep -oE '(href|src)="[^"]+"' "$j" 2>/dev/null || true) \
    | (sed -E 's/.*="([^"]+)"/\1/' || true) \
    | (grep -vE '^(https?:|//|#|mailto:|data:|javascript:)' || true) \
    | (grep -v -F '${' || true) \
    | (grep -vE '^(\.\.?/)*\.?/?$' || true) \
    | sort -u )
  for ref in $refs; do
    ok=0
    for h in index.html $(find games -name '*.html'); do
      d=$(dirname "$h")
      case "$ref" in /*) t=".$ref" ;; *) t="$d/$ref" ;; esac
      t="${t%%\?*}"; t="${t%%#*}"
      if [ -e "$t" ]; then ok=1; break; fi
    done
    if [ "$ok" != "1" ]; then
      echo "MISSING runtime link: $ref (generated in $j)"; exit 1
    fi
  done
done
echo "runtime link check OK"

# Presentation ban: the cloud glyph renders as a washed-out blob on iOS chips.
if grep -rn -F '☁' games/ index.html 2>/dev/null; then
  echo "FAIL: banned glyph ☁ found — use the .dot status indicator instead"; exit 1
fi
echo "glyph check OK"

# Data integrity: countries <-> flag files, duplicates, regions
if command -v node >/dev/null 2>&1; then
  node tools/validate-data.mjs
  node tools/test-quiz.mjs
  node tests/flow.test.mjs
else
  echo "node not available — skipped data + flow checks"
fi

# games-api: Go vet + tests (stdlib only, no downloads)
if command -v go >/dev/null 2>&1; then
  (cd games-api && go vet ./... >/dev/null && go test ./...)
  echo "games-api tests OK"
else
  echo "go not available — skipped games-api tests"
fi

echo "static validation OK"
