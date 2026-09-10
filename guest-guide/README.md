# Welcome Home — Tirana Guest Guide

Print-ready A4 guest guide for the Tirana apartment at
`41°19'21.8"N 19°49'43.6"E` (41.322722, 19.828778).

## Two versions

| File | Wi-Fi | Extra rule |
|---|---|---|
| `welcome-home-tirana-guide.pdf` | placeholder — fill in the existing network | — |
| `welcome-home-tirana-guide-digicom.pdf` | `Digicom.AL - 1` / `merlin1990` | washing-machine pockets rule |

Both are 10 pages, A4, and print fine in black and white.

## Editing

Everything lives in `template.html`. Host-specific values (check-out time,
where the keys go, host name and phone, Wi-Fi) are `{{TOKENS}}` filled in by
`build.mjs`.

```sh
node build.mjs   # template.html -> the two .html files
./render.sh      # the two .html files -> the two .pdf files
```

`render.sh` uses the Chromium that ships with Playwright; set `CHROME=` to
point at any other Chrome/Chromium binary.

## Before printing

Fill in, in `build.mjs`:

- `HOST_NAME` and `HOST_PHONE`
- `CHECKOUT` and `KEYS` (currently 11:00 / kitchen counter)
- `WIFI_SSID` / `WIFI_PASS` for the non-Digicom version
