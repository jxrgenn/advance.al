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
access. They encode the standard `WIFI:T:WPA;S:<ssid>;P:<pass>;;` payload with
a full 4-module quiet zone.

Credentials, security type and the hidden-SSID flag live in `NETWORKS` at the
top of `gen-qr.mjs`. If a network is not broadcast, set `hidden: true` or the
phone will scan the code and then report that it cannot join.

```sh
npm install --no-save qrcode jsqr canvas   # from the repo root
node guest-guide/gen-qr.mjs                # regenerate qr/*.svg
node guest-guide/build.mjs
node guest-guide/verify-qr.mjs             # PASS/FAIL per page
```

`verify-qr.mjs` is the check that matters: it renders each built page in
Chromium at print scale, crops each QR the way a phone would frame it, and
decodes it back. Decoding a freshly generated bitmap proves only that the
encoder works, not that the code on the page is scannable, so do not treat
that as verification.

## Checking the layout before printing

Both pages are fixed-height with `overflow:hidden`, so text that no longer
fits is silently clipped rather than reflowed. After any copy edit, confirm
each page's flow content still clears the closing block at the bottom.
