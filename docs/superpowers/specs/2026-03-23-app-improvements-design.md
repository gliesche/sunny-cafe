# Sunny Cafe Finder — App Improvements Design

## Context

Single-page HTML app (vanilla JS, Leaflet, SunCalc) that finds cafes with sunny terraces.
Currently deployed as static site on Vercel. Target audience: broad public.

## Architecture Decision

Add minimal Vercel Serverless Functions as API proxies with CDN-level caching.
No framework migration — frontend stays vanilla HTML/JS. Each function is ~30 lines,
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

- **Query ownership:** Proxy owns the full Overpass query (cafes + building/highway geometry for facing direction). Frontend sends only `bbox`.
- **BBox normalization:** Frontend rounds to 3 decimal places (~100m grid) before requesting — maximizes CDN hit rate. Proxy validates 4 valid floats only.
- `Cache-Control: s-maxage=86400, stale-while-revalidate=604800` — 24h fresh, 7d stale-while-revalidate. Cafe locations rarely change — CDN serves most requests from cache, Overpass hit max 1x/day per viewport cell.
- Zero dependencies, plain `fetch()` to Overpass
- **No direct Overpass fallback** — CDN stale-while-revalidate (24h) + service worker cache + error toast provide sufficient resilience. Three cache layers before a user sees nothing.
- **Service worker update needed:** `sw.js` must cache `/api/cafes` and `/api/weather` instead of raw Overpass URLs after migration.

### 2. Shareable Links (URL State)

```
sunny-cafe.gliesche.net?lat=53.55&lng=9.99&z=15&t=14:30&d=2026-03-29&q=Hamburg
```

- **Parameters:** `lat`, `lng`, `z` (zoom), `t` (time HH:MM), `d` (date YYYY-MM-DD), `q` (search query, cosmetic)
- **`q` param:** Optional — populates search bar for context on shared links. Lat/lng stays authoritative (no Nominatim call on load).
- On load: read URL params → init map + slider + search bar
- **replaceState timing:** Event-specific — fires on `moveend`, slider `change`, and date `change`. No extra debounce needed (each event fires at "settled" moments).
- No params = current behavior: geolocation → fallback Hamburg, current time

### 3. Date Picker

- Click on date text (e.g. "Mo., 23. Marz") opens native `<input type="date">`
- Slider range adjusts: SunCalc recalculates sunrise/sunset for selected date
- Default remains "today + now"
- URL param `d=2026-03-29` synced
- No extra UI footprint — existing date text becomes clickable
- **Date range:** Unrestricted — SunCalc works for any date. Weather indicator grayed out ("—") for dates outside Open-Meteo's 7-day forecast window.

### 4. Opening Hours

- **Parser:** `opening_hours.js` — full library including German holiday data (`PH` rules). Lazy loaded after initial render.
- **Display:** Closed cafes get semi-transparent markers (opacity 0.3) and "Geschlossen" badge in popup
- **Filter:** Toggle **"Geschlossene ausblenden"** in legend area — default ON. Hides cafes known to be closed; cafes without `opening_hours` stay always visible.
- **Sun window combo:** Popup shows e.g. "Sonne 14:00-17:00, geoffnet bis 18:00" or "Sonne 14:00-17:00, aber schliesst um 15:00"
- **Fallback:** Cafes without `opening_hours` in OSM stay always visible

---

## Phase 2 — UX & Data

### 5. Weather / Open-Meteo

**File:** `api/weather.js` (separate from cafe proxy)

```
Frontend → /api/weather?lat=53.55&lng=9.99
         → Vercel CDN (Cache-Control: s-maxage=1800)
         → on cache miss: Open-Meteo API
         → response to CDN + client
```

- **Separate endpoint** — not merged with cafe proxy. Reasons: different cache TTLs, independent failure isolation, simpler functions, frontend parallelizes both requests.
- `Cache-Control: s-maxage=1800, stale-while-revalidate=3600` — 30min fresh, 1h stale-while-revalidate
- **Score adjustment:** Cloud cover >60% → downgrade one step (sonnig→teilweise). Cloud cover >85% → force shade. Thresholds conservative for Germany's climate — prevents permanently gray map Oct–Apr.
- **Display:** Prominent cloud badge next to time slider: "☁ 15%" or "☁ 65%" — shows cloud cover for selected hour. Primary signal — users decide from this.
- **Date combo:** Works with date picker — Open-Meteo delivers 7-day forecast. Beyond 7 days: badge hidden, scores use sun geometry only.
- **Today:** Uses actual values for past hours (Open-Meteo provides both)

### 6. Mobile UX

- **Bottom sheet instead of popup:** Tap on cafe dot opens sheet from bottom (40% height) on viewports < 768px. Swipe-down to close.
- **Implementation:** Custom vanilla JS (~60 lines) — `touchstart`/`touchmove`/`touchend` + `translateY` with velocity threshold for dismiss. No library dependency.
- **Sheet content:** Same data as desktop popup, reorganized vertically:
  - Top row: Name + colored score dot (green/orange/gray)
  - Middle: Sun window + opening hours
  - Bottom row: Facing direction + distance from map center
  - AI description (if available) as second line under name
- **Time slider:** Wider touch area (44px thumb instead of 20px), plus tap on time label opens native time picker as alternative
- **Map:** Touch area fully usable, sheet overlaps only lower portion
- **Desktop:** Stays as-is with Leaflet popups — bottom sheet only < 768px

### 7. Cafe List (Toggle View)

- **Toggle button:** Top right next to sun compass, map/list icon.
- **Mobile (<768px):** Full overlay panel — map stays alive underneath (no Leaflet invalidateSize issues). Toggle shows/hides.
- **Desktop (≥768px):** 60/40 split — map left, list right. Toggle hides list and map goes full width.
- **List shows:**
  - Cafe name + score dot (green/orange/gray)
  - Sun window: "14:00-17:00"
  - Distance from map center
  - Open/closed status
- **Sorting:** Two tappable text labels at top — **Sonnigste** · Nächste. Active one bold/underlined. Secondary sort: distance (for sunny-first), sunny score (for distance-first).
- **Tap on list item:** Switches back to map view, centers on cafe, opens popup/sheet
- **Data:** Same data as map — no extra API call. List renders the `cafes` array differently.
- **Weather:** Cloud cover already factored into score

---

## Build Order

Topological dependency order — each step can be shipped and tested independently:

1. **API Proxy** (`api/cafes.js`) — unblocks everything server-side
2. **URL State** — unblocks date picker
3. **Date Picker** — unblocks weather interaction
4. **Opening Hours** — unblocks mobile UX and list view
5. **Weather** (`api/weather.js` + score integration) — unblocks final list sorting
6. **Mobile Bottom Sheet** — all data available now
7. **Cafe List** (split + toggle) — depends on everything, ship last

---

## Dependencies

| Dependency | Type | Size | Purpose |
|-----------|------|------|---------|
| `opening_hours.js` | npm/CDN | ~60-80KB (with holidays) | OSM opening_hours parser incl. German holidays |

All other functionality uses browser APIs, existing libraries (Leaflet, SunCalc), or the Vercel Function runtime.

## Non-Goals

- User accounts / favorites
- AI enrichment (separate effort)
- Server-side rendering / framework migration
- Offline-first (PWA service worker handles basic caching already)
- Route/directions button (potential future addition)
