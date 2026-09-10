# Welcome Home — Tirana Guest Guide

Two-page A4 guest guide for the Tirana apartment, built from the outline of
the original PDF: page 1 is the stay (Wi-Fi, rules, medical, money,
emergency), page 2 is the local picks.

## Two versions

| File | Wi-Fi | Extra rule |
|---|---|---|
| `welcome-home-tirana-guide.pdf` | `merlin 5GHZ` + `merlin 2.4GHZ` · `101090ora20` | — |
| `welcome-home-tirana-guide-digicom.pdf` | `Digicom.AL - 1` · `merlin1990` | empty-your-pockets / washing machine |

Both print fine in black and white.

## Building

```sh
node build.mjs   # template.html + qr/*.svg -> the two .html files
./render.sh      # the two .html files -> the two .pdf files
```

`build.mjs` needs no npm packages. `render.sh` uses the Chromium that ships
with Playwright; set `CHROME=` to point at any other Chrome/Chromium binary.

## Wi-Fi QR codes

`qr/*.svg` are pre-generated and committed, so a rebuild never needs network
access. They encode the standard `WIFI:T:WPA;S:<ssid>;P:<pass>;;` payload, and
each one has been decoded back to verify it matches the credentials printed
beside it. If the credentials change, edit `gen-qr.mjs` and re-run it — it
regenerates and re-verifies in one pass:

```sh
npm install --no-save qrcode jsqr canvas   # from the repo root
node guest-guide/gen-qr.mjs                # prints PASS/FAIL per network
```

## Checking the layout before printing

Both pages are fixed-height with `overflow:hidden`, so text that no longer
fits is silently clipped rather than reflowed. After any copy edit, confirm
each page's flow content still clears the closing block at the bottom.
