# Sunny Cafe Finder — App Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the static Sunny Cafe Finder into a production-ready PWA with API proxy, weather integration, shareable links, opening hours, mobile bottom-sheet, and list view.

**Architecture:** Vanilla HTML/JS frontend (single `index.html`) + two Vercel Serverless Functions (`api/cafes.js`, `api/weather.js`) with CDN caching. No framework, no build step, zero npm dependencies in the functions.

**Tech Stack:** Vanilla JS, Leaflet, SunCalc, `opening_hours.js` (CDN), Vercel Functions (Node.js runtime), Open-Meteo API, Overpass API

**Note on XSS:** The app renders cafe names from OSM data via DOM manipulation. The existing code uses template literals with `.bindPopup()` and list rendering. Cafe names from OSM are user-contributed and should be escaped before rendering. Use `textContent` for plain text elements and escape HTML entities for template strings.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `api/cafes.js` | Create | Overpass proxy with CDN cache headers |
| `api/weather.js` | Create | Open-Meteo proxy with CDN cache headers |
| `index.html` | Modify | All frontend changes (URL state, date picker, opening hours, weather, mobile UX, list view) |
| `sw.js` | Modify | Bump cache version, add API routes to network-first strategy |

---

## Phase 1 — Foundation

### Task 1: API Proxy for Overpass

**Files:**
- Create: `api/cafes.js`
- Modify: `index.html:273-291` (replace direct Overpass calls)
- Modify: `index.html:365-376` (replace Overpass query in loadData)

- [ ] **Step 1: Create `api/cafes.js`**

Vercel Serverless Function that accepts `?bbox=south,west,north,east`, validates 4 numeric values, constructs the Overpass QL query (cafes with outdoor_seating + nearby streets), forwards to Overpass, and returns the JSON with CDN cache headers: `s-maxage=3600, stale-while-revalidate=86400`.

- [ ] **Step 2: Replace frontend Overpass calls**

Replace `fetchOverpass` with `fetchCafes(bbox)` that calls `/api/cafes?bbox=...`. The frontend rounds bbox to 3 decimal places before requesting (for CDN cache key normalization). Keep retry logic with toast notifications. Remove the inline Overpass query from `loadData`. Keep localStorage cache as secondary client-side cache for instant back-navigation.

- [ ] **Step 3: Update service worker**

In `sw.js`, add `/api/` routes to the network-first fetch strategy and bump cache version to `sunny-cafe-v2`.

- [ ] **Step 4: Verify in browser**

Run `vercel dev`, open `http://localhost:3000`. Check Network tab: cafes load via `/api/cafes`, response has CDN cache headers.

- [ ] **Step 5: Commit**

```bash
git add api/cafes.js index.html sw.js
git commit -m "feat: add Overpass API proxy with CDN caching"
```

---

### Task 2: Shareable Links (URL State)

**Files:**
- Modify: `index.html` — startup function, `initMap`, `initTimeSlider`, `searchLocation`, map moveend handler

- [ ] **Step 1: Add URL reading on startup**

Add `readUrlState()` that parses `lat`, `lng`, `z`, `t`, `d`, `q` from `URLSearchParams`. Replace IIFE `init()` to use URL params if present, else fall back to geolocation/Hamburg. If `q` present, set `searchInput.value` (cosmetic only — lat/lng is authoritative).

- [ ] **Step 2: Add URL writing on state change**

Add `updateUrl()` using `history.replaceState()`. Include `q` param from current search input value if non-empty. Call at "settled" moments only (no extra debounce): map `moveend`, slider `change` (mouseup/touchend, not `input`), date picker `change`, `setNow()`, `searchLocation()`. Do NOT call on slider `input` during drag — URL lags are fine, nobody reads it mid-drag.

- [ ] **Step 3: Verify in browser**

- Move map → URL updates with lat/lng/z/t
- Copy URL → paste in new tab → same location/time
- Open without params → geolocation/fallback

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: shareable links via URL state"
```

---

### Task 3: Date Picker

**Files:**
- Modify: `index.html` — add hidden date input, make date text clickable, handle date change, update slider range

- [ ] **Step 1: Add hidden date input and clickable date text**

Add `<input type="date" id="datePicker">` (hidden, triggered on click of date span). Add state variable `selectedDate = null` (null = today).

- [ ] **Step 2: Handle date change**

On date input change: set `selectedDate`, recalculate `sunTimes` via SunCalc for the new date, update slider range (sunrise/sunset), update `selectedTime` to same HH:MM on new date, update display, call `updateUrl()`.

- [ ] **Step 3: Extract `updateSliderRange()` from `initTimeSlider`**

Pull slider min/max calculation into reusable function for both init and date change.

- [ ] **Step 4: Wire URL param `d` on startup**

If `d` param present on load, set datePicker value and trigger the change flow.

- [ ] **Step 5: Verify in browser**

- Click date → native picker opens
- Select future date → sunrise/sunset labels update
- URL shows `d=YYYY-MM-DD`
- Reload with `d` param → correct date

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: date picker for planning future cafe visits"
```

---

### Task 4: Opening Hours

**Files:**
- Modify: `index.html` — add CDN script, modify `processData`, modify `updateSunnyScores`, add filter toggle

- [ ] **Step 1: Add `opening_hours.js` CDN script**

Add before main script tag:
```html
<script src="https://cdn.jsdelivr.net/npm/opening_hours@3/build/opening_hours.min.js"></script>
```

- [ ] **Step 2: Parse opening hours in `processData`**

For each cafe with an `hours` string, create an `opening_hours` instance. Store as `cafe.oh`. Wrap in try/catch (some OSM hours strings are malformed).

- [ ] **Step 3: Update `updateSunnyScores` for opening hours**

Calculate `cafe.isOpen` from `cafe.oh.getState(selectedTime)`. If closed and filter on: skip marker. If closed and filter off: render with opacity 0.3 and "Geschlossen" badge. In popup, show open/closed status and next change time.

- [ ] **Step 4: Add filter toggle to legend**

Add checkbox "Nur geöffnete" (default checked). Wire to trigger `updateSunnyScores()`.

- [ ] **Step 5: Verify in browser**

- Cafes show open/closed in popup
- Filter toggle hides/shows closed cafes
- Slide to late evening → most cafes closed
- Cafes without hours always visible

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: opening hours display with filter toggle"
```

---

## Phase 2 — UX & Data

### Task 5: Weather Proxy + Frontend Integration

**Files:**
- Create: `api/weather.js`
- Modify: `index.html` — weather state, fetch, cloud display, score weighting

- [ ] **Step 1: Create `api/weather.js`**

Accepts `?lat=...&lng=...`, validates, forwards to `https://api.open-meteo.com/v1/forecast?hourly=cloud_cover&forecast_days=7`, returns with `Cache-Control: s-maxage=900, stale-while-revalidate=3600`.

- [ ] **Step 2: Add weather fetch to frontend**

Add `weatherData` state. Add `fetchWeather()` calling `/api/weather?lat=...&lng=...` (coordinates rounded to 2 decimals). Call on map init and `moveend`. Fail silently — weather is optional.

- [ ] **Step 3: Extract cloud cover for selected time**

Add `getCloudCover(time)` that finds the matching hourly bucket in the weather response.

- [ ] **Step 4: Weight sunny scores by cloud cover**

In `calculateScore`: if cloud > 60% and score was "sunny", downgrade to "partial". If cloud > 85%, downgrade to "shade" regardless.

- [ ] **Step 5: Display cloud cover in time panel**

Add small badge next to time value showing cloud icon + percentage for the selected hour.

- [ ] **Step 6: Verify in browser**

- Network tab shows `/api/weather` call
- Cloud badge updates when sliding time
- Sunny cafes downgraded during cloudy hours
- App works if weather API fails

- [ ] **Step 7: Commit**

```bash
git add api/weather.js index.html
git commit -m "feat: weather integration via Open-Meteo with cloud cover scoring"
```

---

### Task 6: Mobile UX — Bottom Sheet + Slider

**Files:**
- Modify: `index.html` — bottom sheet CSS/HTML/JS, touch handling, wider slider thumb

- [ ] **Step 1: Add bottom sheet CSS + HTML**

Fixed sheet at bottom, slides up on open. Includes drag handle bar. Max-height 45vh. Smooth transform transition. Add the HTML element with `id="bottomSheet"`.

- [ ] **Step 2: Modify marker click for mobile**

If viewport < 768px: marker click opens bottom sheet (not Leaflet popup). Fill sheet with same cafe info. Desktop keeps Leaflet popups.

- [ ] **Step 3: Add swipe-to-close**

Track touchstart/touchend on sheet. If swipe-down > 60px, close. Also close on map click.

- [ ] **Step 4: Widen slider thumb on mobile**

Add `@media (max-width: 768px)` rule with 28px thumb size (up from 20px).

- [ ] **Step 5: Verify in browser**

- DevTools mobile viewport → tap cafe → sheet slides up
- Swipe down → closes
- Desktop → popups unchanged
- Slider easy to grab on mobile

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: mobile bottom sheet and larger touch targets"
```

---

### Task 7: Cafe List (Toggle View)

**Files:**
- Modify: `index.html` — toggle button, list container CSS, list rendering JS, sorting

- [ ] **Step 1: Add toggle button + list container**

Round button next to sun compass with list/map icon. List container fills the viewport between search bar and time panel, scrollable.

- [ ] **Step 2: Implement toggle and list rendering**

`toggleView()` hides map, shows list (or vice versa). `renderList()` builds list items from `cafes` array using safe DOM methods (createElement + textContent to avoid XSS from OSM data). Each item shows: score dot, name, sun window, distance from center, open/closed.

- [ ] **Step 3: Add sorting controls**

Two sort buttons at top of list: "Sonnig zuerst" (score) and "Nächste zuerst" (distance). Default: score. Score order: sunny > partial > shade > unknown > night.

- [ ] **Step 4: Add focus-on-click**

Tapping a list item: switch to map view, center on cafe (zoom 17), open popup/sheet.

- [ ] **Step 5: Update list when scores change**

At end of `updateSunnyScores`, if `listView` is active, call `renderList()`.

- [ ] **Step 6: Verify in browser**

- Toggle → list appears sorted by score
- Each item shows name, dot, sun window, distance
- Sort buttons work
- Click item → map view, centered
- Slide time → list updates

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: cafe list view with score and distance sorting"
```

---

### Task 8: Final Integration + Deploy

- [ ] **Step 1: Bump service worker cache**

Set `CACHE = 'sunny-cafe-v3'` in `sw.js`.

- [ ] **Step 2: Full integration test via `vercel dev`**

Test: geolocation/URL params, proxy loading, weather badge, date picker, opening hours filter, mobile bottom sheet, list toggle, URL sharing, offline (service worker).

- [ ] **Step 3: Deploy**

```bash
git push
```

Verify at https://sunny-cafe.gliesche.net

- [ ] **Step 4: Commit any integration fixes**

```bash
git commit -m "fix: integration fixes from final testing"
```
