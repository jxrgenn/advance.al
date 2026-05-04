#!/bin/bash
# Run the Playwright exploratory walker — captures screenshots + videos for visual review.
#
# Each project (desktop / mobile pixel5 / mobile iphone12) is run sequentially because
# they share the same backend launcher and DB. Each gets its own report folder.

set -e

cd "$(dirname "$0")/.."

echo "▶ Walker — desktop chromium (1440×900)"
PLAYWRIGHT_HTML_REPORT=playwright-walker-report-desktop \
  npx playwright test -c playwright.walker.config.ts --project=desktop-chromium

echo "▶ Walker — mobile Pixel 5"
PLAYWRIGHT_HTML_REPORT=playwright-walker-report-pixel5 \
  npx playwright test -c playwright.walker.config.ts --project=mobile-pixel5

echo "▶ Walker — mobile iPhone 12 (WebKit)"
PLAYWRIGHT_HTML_REPORT=playwright-walker-report-iphone12 \
  npx playwright test -c playwright.walker.config.ts --project=mobile-iphone12

echo ""
echo "✓ Walker complete. Open reports:"
echo "  npx playwright show-report playwright-walker-report-desktop"
echo "  npx playwright show-report playwright-walker-report-pixel5"
echo "  npx playwright show-report playwright-walker-report-iphone12"
