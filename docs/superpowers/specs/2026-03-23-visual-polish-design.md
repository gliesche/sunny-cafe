# Sunny Cafe Finder — Visual Polish

## Scope

Polish pass over existing UI. No redesign, no new features — consistency, spacing, and bug fixes.

---

## 1. Popup-Konsistenz

Desktop popup currently shows raw OSM opening_hours string. Align with bottom sheet format.

- **Before:** `Mo-Fr 07:30-19:30; Sa 09:30-19:30; PH,Su 10:00-19:30`
- **After:** `Geöffnet bis 19:30` (green) or `Geschlossen` (gray)
- **Fallback:** If `opening_hours.js` hasn't loaded yet, show raw string as before
- **Implementation:** Reuse the same parsing logic from `updateSunnyScores()` in the popup builder

## 2. Listen-Farbpunkte

Bug: list dots are all gray because `cafe.score.color` isn't being applied to the dot.

- Fix: set `dot.style.background = cafe.score.color` in `renderList()`
- Score dots should match map marker colors: green (#4CAF50), orange (#FF9800), gray (#78909C)

## 3. Legende ins Time-Panel integrieren

Remove floating legend box. Add horizontal legend row below the slider in the time panel.

- **Layout:** `Sonnig · Teilweise · Schatten | ☑ Geschl. ausbl.` — all in one flex row
- **Style:** 11px, #999 color, dots same as map markers, checkbox with gold accent
- **Filter checkbox:** Same `filterClosed` toggle, same behavior
- **Remove:** `.legend` CSS class and the floating `<div class="legend">` from HTML
- **Responsive:** Row wraps naturally on narrow viewports

## 4. Cloud Badge prominenter

Move cloud badge from inline (after date) to right-aligned in the time header row.

- **Position:** `justify-content: space-between` — time+date left, cloud badge right (before JETZT button)
- **Size:** 14px font, slightly larger padding (3px 10px), 8px border-radius
- **Colors unchanged:** green <60%, orange 60-85%, red >85%, gray when unavailable

## 5. Typografie-System

Consistent font sizes and colors across all UI elements:

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Time value | 22px | 600 | #FFD700 |
| Cafe name (popup/sheet) | 15px | 600 | #e0e0e0 |
| Cafe name (list) | 14px | 500 | #e0e0e0 |
| Labels | 13px | 400 | #e0e0e0 |
| Meta-info / secondary | 12px | 400 | #888 |
| Legend / footnotes | 11px | 400 | #999 |
| Tertiary | any | any | #555 |
| Accent | any | any | #FFD700 |
| Open status | 12px | 400 | #4CAF50 |
| Closed status | 12px | 400 | #78909C |

## 6. Slider Touch Target (already fixed)

- Desktop: 24px thumb
- Mobile (<768px): 32px thumb, 44px input height for touch area
- Track remains 6px

## Non-Changes

- Controls grouping: keep separate (sun compass + list toggle as individual circles)
- Overall layout: unchanged
- Color scheme: unchanged
- Map tiles: unchanged
