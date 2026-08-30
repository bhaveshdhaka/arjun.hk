#!/usr/bin/env bash
# arjun.hk static-site validation. CI runs this same script.
set -euo pipefail

# Validate root index.html
test -s index.html && echo "index.html present and non-empty"
grep -q "</html>" index.html && echo "html closes properly"
for img in $(grep -oE 'src="[^"]+\.(png|jpg|jpeg|svg|webp)"' index.html | sed -E 's/.*src="([^"]+)"/\1/' | sort -u); do
  test -f "$img" || { echo "MISSING asset: $img"; exit 1; }
done

# Validate the research report page
test -s manish/index.html && echo "manish/index.html present and non-empty"
grep -q "</html>" manish/index.html && echo "manish/html closes properly"

echo "static validation OK"

