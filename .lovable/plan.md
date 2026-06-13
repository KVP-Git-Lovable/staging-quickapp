# Improve GPS Capture Resilience

## Root cause
The screenshot shows `Location Capture Failed — Timeout expired`. This comes from the browser's Geolocation API (`error.TIMEOUT`), not from our backend or RLS. On mobile Chrome, a 15-second high-accuracy fix frequently fails when:
- The user is indoors / has weak GPS signal
- Chrome site permission is set to "Approximate" instead of "Precise"
- Android Location mode is "Battery saving" instead of "High accuracy"
- The browser hasn't had a recent fix and cold-starts GPS

So this is **primarily a device/permission issue**, but our current capture logic gives up after one strict attempt. We can make it succeed in more real-world conditions.

## Plan

Update the GPS capture used by the order/check-in "Capture Location" flow in `src/components/VisitCard.tsx` (around line 1864-1898) with a 3-stage strategy:

1. **Stage 1 — fast cached fix**: `enableHighAccuracy: false`, `timeout: 5s`, `maximumAge: 60_000`. Returns instantly if the OS already has a recent fix.
2. **Stage 2 — high accuracy**: `enableHighAccuracy: true`, `timeout: 15s`, `maximumAge: 0`. Current behaviour.
3. **Stage 3 — low accuracy fallback**: `enableHighAccuracy: false`, `timeout: 20s`, `maximumAge: 120_000`. Uses cell/Wi-Fi positioning when GPS can't lock.

Only if all three fail do we show the toast. Update the error message to be actionable:

> "Couldn't get GPS fix. Please move near a window, enable **Precise location** for this site in Chrome, and set Android Location to **High accuracy**, then tap Capture Location again."

Apply the same 3-stage helper to the other `getCurrentPosition` call sites that block order flow:
- `src/components/VisitCard.tsx` line ~1467 (check-in)
- `src/components/VisitCard.tsx` line ~1774 (check-out)
- `src/components/VisitCard.tsx` line ~3826 (retailer GPS capture)
- `src/utils/gpsRouteOptimizer.ts` `getCurrentLocation` (Start Beat)

Extract a single helper `getResilientLocation()` in `src/utils/gpsRouteOptimizer.ts` so all call sites share the same retry logic.

## Out of scope
- No backend / RLS / schema changes
- No UI redesign of the dialog itself
- Does not change the rule that order placement requires a captured location

## What the user should also do on the phone
1. Chrome → site settings for `lovable.dev` → Location = **Allow + Precise**
2. Android Settings → Location → **High accuracy mode**
3. Step outside or near a window once, so the OS warms up its GPS cache (Stage 1 will then succeed instantly on subsequent attempts)
