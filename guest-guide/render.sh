#!/usr/bin/env bash
# Renders both HTML versions to print-ready A4 PDFs using the bundled Chromium.
set -euo pipefail
cd "$(dirname "$0")"

CHROME="${CHROME:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v chromium || command -v google-chrome)"

for f in welcome-home-tirana-guide welcome-home-tirana-guide-digicom; do
  "$CHROME" --headless --disable-gpu --no-sandbox \
    --no-pdf-header-footer \
    --print-to-pdf="$PWD/$f.pdf" \
    "file://$PWD/$f.html" 2>&1 | grep -vi "warning\|fontconfig\|DevTools\|GPU\|dbus" || true
  echo "rendered $f.pdf"
done
