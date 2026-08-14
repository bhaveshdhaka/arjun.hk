#!/usr/bin/env bash
# arjun.hk static-site validation. CI runs this same script.
set -euo pipefail

# Validate root index.html
test -s index.html && echo "index.html present and non-empty"
grep -q "</html>" index.html && echo "html closes properly"
for img in $(grep -oE 'src="[^"]+\.(png|jpg|jpeg|svg|webp)"' index.html | sed -E 's/.*src="([^"]+)"/\1/' | sort -u); do
  test -f "$img" || { echo "MISSING asset: $img"; exit 1; }
done

# Validate snake/index.html
test -s snake/index.html && echo "snake/index.html present and non-empty"
grep -q "</html>" snake/index.html && echo "snake/html closes properly"
# snake game has no external assets (all inline)

echo "static validation OK"
