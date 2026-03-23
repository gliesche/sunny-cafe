# Sunny Cafe Finder — App Improvements Design

## Context

Single-page HTML app (vanilla JS, Leaflet, SunCalc) that finds cafes with sunny terraces.
Currently deployed as static site on Vercel. Target audience: broad public.

## Architecture Decision

Add a minimal Vercel Serverless Function as API proxy with CDN-level caching.
No framework migration — frontend stays vanilla HTML/JS. The function is ~30 lines,
zero dependencies, and replaceable if we move off Vercel.

---

## Phase 1 — Foundation

### 1. API Proxy with CDN Cache

**File:** `api/cafes.js`

```
Frontend → /api/cafes?bbox=53.5,9.9,53.6,10.1
         → Vercel CDN (Cache-Control: s-maxage=3600)
         → on cache miss: Overpass API
         → response to CDN + client
```

- BBox rounded to 3 decimal places (~100m grid) by the frontend before requesting — maximizes CDN hit rate. Proxy only validates 4 valid numbers.
- `Cache-Control: s-maxage=3600, stale-while-revalidate=86400` — 1h fresh, 24h stale-while-revalidate
- Zero dependencies, plain `fetch()` to Overpass
- Frontend changes only the Overpass URL to `/api/cafes?bbox=...`
- No direct Overpass fallback — CDN stale-while-revalidate (24h) + service worker cache provide sufficient resilience. Error toast on failure.

### 2. Shareable Links (URL State)

```
sunny-cafe.gliesche.net?lat=53.55&lng=9.99&z=15&t=14:30&d=2026-03-29
```

- **Parameters:** `lat`, `lng`, `z` (zoom), `t` (time HH:MM), `d` (date YYYY-MM-DD)
- On load: read URL params → init map + slider
- On change: `history.replaceState()` — URL updates without reload, no back-button spam
- No params = current behavior: geolocation → fallback Hamburg, current time

### 3. Date Picker

- Click on date text (e.g. "Mo., 23. Marz") opens native `<input type="date">`
- Slider range adjusts: SunCalc recalculates sunrise/sunset for selected date
- Default remains "today + now"
- URL param `d=2026-03-29` synced
- No extra UI footprint — existing date text becomes clickable

### 4. Opening Hours

- **Parser:** `opening_hours.js` (~8KB library for OSM opening_hours format)
- **Display:** Closed cafes get semi-transparent markers (opacity 0.3) and "Geschlossen" badge in popup
- **Filter:** Toggle "Nur geoffnete" in legend area — default on
- **Sun window combo:** Popup shows e.g. "Sonne 14:00-17:00, geoffnet bis 18:00" or "Sonne 14:00-17:00, aber schliesst um 15:00"
- **Fallback:** Cafes without `opening_hours` in OSM stay always visible

---

## Phase 2 — UX & Data

### 5. Weather / Open-Meteo

```
GET https://api.open-meteo.com/v1/forecast?latitude=53.55&longitude=9.99
    &hourly=cloud_cover&forecast_days=7
```

- **Separate endpoint:** `GET /api/weather?lat=53.55&lng=9.99` — not merged with cafe proxy. Reasons: different cache TTLs (weather 15min, cafes 1h), independent failure (cafes load if Open-Meteo is down), simpler functions, frontend parallelizes both requests
- `Cache-Control: s-maxage=900, stale-while-revalidate=3600` — 15min fresh, 1h stale
- **Score adjustment:** Sunny score weighted by cloud cover. 80% cloudy → south-facing cafe becomes "Teilweise" instead "Sonnig"
- **Display:** Small cloud icon next to time slider: "15%" or "65%" — shows cloud cover for selected hour
- **Date combo:** Works with date picker — Open-Meteo delivers 7-day forecast
- **Today:** Uses actual values for past hours (Open-Meteo provides both)

### 6. Mobile UX

- **Bottom sheet instead of popup:** Tap on cafe dot opens sheet from bottom (40% height) on viewports < 768px. Name, score, hours, sun window at a glance. Swipe-down to close.
- **Time slider:** Wider touch area (44px thumb instead of 20px), plus tap on time label opens native time picker as alternative
- **Map:** Touch area fully usable, sheet overlaps only lower portion
- **Desktop:** Stays as-is with Leaflet popups — bottom sheet only < 768px

### 7. Cafe List (Toggle View)

- **Toggle button:** Top right next to sun compass, map/list icon. Tap switches between map and list view.
- **List shows:**
  - Cafe name + score dot (green/orange/gray)
  - Sun window: "14:00-17:00"
  - Distance from map center
  - Open/closed status
- **Sorting:** Default by sunny score (sunny first), alternative by distance
- **Tap on list item:** Switches back to map, centers on cafe, opens popup/sheet
- **Data:** Same data as map — no extra API call. List renders the `cafes` array differently.
- **Weather:** Cloud cover already factored into score

---

## Dependencies

| Dependency | Type | Size | Purpose |
|-----------|------|------|---------|
| `opening_hours.js` | npm/CDN | ~8KB | OSM opening_hours parser |

All other functionality uses browser APIs, existing libraries (Leaflet, SunCalc), or the Vercel Function runtime.

## Non-Goals

- User accounts / favorites
- AI enrichment (separate effort)
- Server-side rendering / framework migration
- Offline-first (PWA service worker handles basic caching already)
