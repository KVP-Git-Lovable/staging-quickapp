# Follow-up: tighten Fix 1 + Fix 2 env-key handling

Two small, scoped tightenings on top of what just shipped.

## 1. Make Fix 1's pre-check actually proactive

Current behavior: `checkLocationAvailability()` runs only when the "Location Not Captured" dialog opens. That misses two real cases:

- The dialog never opens because some other guard short-circuits first.
- On web, `permissions.query({ name: 'geolocation' })` returns `'prompt'` for first-time use, so we say "ready" but the browser may still block.
- Native: we currently only check, we never *request*. If permission is `'prompt'`, the capture click triggers the OS dialog; on `'denied'`, the user gets a destructive chip but no path forward.

Changes in `src/utils/locationStatus.ts` and `src/components/VisitCard.tsx`:

- In `checkLocationAvailability()`:
  - Add a `'prompt'` branch returning `{ status: 'prompt', message: null }` (new status) so the UI knows to show a softer hint like "Tap Capture to allow location access."
  - On native, if state is `'prompt'`, call `Geolocation.requestPermissions()` lazily *only* when the user clicks Capture (not on dialog open — avoids a surprise OS prompt).
- In the Capture button's click handler:
  - Before `getResilientLocation()`, if status is `'prompt'` on native, call `requestPermissions()` first; if it comes back `'denied'`, surface the denied warning inline and stop.
  - Keep the existing `classifyLocationError` catch path as the safety net.
- Add an `openAppSettings` link in the chip when status is `'denied'` on native, reusing the existing `openAppSettings()` helper from `src/utils/permissions.ts` (already used by `PermissionRequestModal`). Web stays text-only.

No changes to the database, no changes to capture payload.

## 2. Confirm and lock down Fix 2's Google key resolution

Current: `src/utils/reverseGeocode.ts` reads `VITE_GOOGLE_MAPS_API_KEY` then falls back to `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`. Both `.env` entries (`VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_GEOCODING_API_KEY`) are present but **empty**, meaning the util silently falls through to OSM Nominatim on most installs — addresses still save, but never via Google.

Changes in `src/utils/reverseGeocode.ts`:

- Resolve the key in this order, picking the first non-empty value:
  1. `VITE_GOOGLE_GEOCODING_API_KEY` (most specific)
  2. `VITE_GOOGLE_MAPS_API_KEY`
  3. `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` (managed connector)
- Treat empty string the same as missing (current `&&` check passes `""` as falsy, but explicit `.trim()` guard makes intent clear).
- Add a one-time `console.info` on first call when no key is found, so it's obvious in DevTools why Google is being skipped — no toast, no user-facing noise.
- No new env vars introduced; nothing in `.env` changes.

Optional follow-up (not in this change): the Google Maps Platform connector is the recommended path per project guidelines — if you want, we can route the geocode call through the connector gateway instead of the browser key, which gives you a single managed credential across the app. Say the word and I'll plan that separately.

## Technical notes

- New `LocationStatus` value: `'prompt'`. Update the union type and `LocationCheckResult.status`.
- `@capacitor/geolocation` is already a dependency; no installs needed.
- `openAppSettings` already exists in `src/utils/permissions.ts`.
- Scope: `src/utils/locationStatus.ts`, `src/utils/reverseGeocode.ts`, `src/components/VisitCard.tsx` capture dialog block only. No DB, no other components.
