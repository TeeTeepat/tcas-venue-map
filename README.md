# TCAS venue map (สนามสอบ TGAT/TPAT ใกล้บ้าน)

Public map of every TCAS70 TGAT/TPAT2-5 exam venue. Pin your home (GPS or tap, with an
emoji), venues sort by straight-line distance, filter by exam, and see seat capacity,
air conditioning and BTS/MRT access per venue. Fully static: no server, no database.

## Data

`npm run data` snapshots the official public JSON behind https://www.mytcas.com/venues:

- `assets.mytcas.com/70/tgattpat/venues.json` - seats per venue per exam day
- `assets.mytcas.com/70/tgattpat/venue-details.json` - map link, transit, aircon

Exam days: 1 = 30 Jan 2027 (TGAT, TPAT3), 2 = 31 Jan (TPAT2, TPAT5), 3 = 1 Feb (TPAT4).
Coordinates come from expanding each venue's Google Maps link (cached in
`data/coords-cache.json`); venues without one are geocoded into `data/coords-manual.json`
(precision `approx` = district centroid, flagged in the UI). Output: `src/data/venues.json`.

Seat numbers are venue capacity, not seats left - TCAS70 allocates seats centrally.

## Stack

Next.js static export (`out/`), Tailwind, MapLibre GL + OpenFreeMap tiles (no API key).
The home pin lives only in the browser's localStorage.

```bash
npm run data   # refresh snapshot from mytcas
npm run build  # static site in out/
```

## Roadmap

- Google Sheet for extras (parking, food, rooms) + Google Form for student tips
- Ads + PromptPay donation (move hosting to Cloudflare Pages, add privacy page + PDPA consent)
