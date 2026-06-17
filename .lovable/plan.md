## Goal

Replace the single, vague `location_check_in_enabled` flag with two clearly described flags so each company can independently enable GPS-location capture and selfie/camera capture on the retailer visit Check-In/Out.

## New flags in `feature_flags`

1. **Capture Location on Visit Check-in** — key `visit_location_capture_enabled`
   - Description: "Captures GPS coordinates of the rep when they Check-In / Check-Out on a retailer visit (My Visits → Visit card). Used for proximity validation and visit reports."
2. **Capture Selfie on Visit Check-in** — key `visit_camera_capture_enabled`
   - Description: "Requires the rep to take a front-camera selfie photo when Checking-In to a retailer visit. Photo is stored against the visit log."

Both default to ON so current behavior is preserved. The Check-In / Check-Out button shows whenever EITHER flag is ON.

## Database migration

- Insert the two new rows into `feature_flags` (idempotent). Initial value of each = current value of `location_check_in_enabled` if present, else ON.
- Update the legacy `location_check_in_enabled` row's description to: "(Legacy) Master Visit Check-in toggle — superseded by 'Capture Location on Visit Check-in' and 'Capture Selfie on Visit Check-in'. Keep ON unless both new flags are OFF."
- Keep the legacy flag for one release so nothing breaks for companies that haven't migrated.

## Code changes

**`src/hooks/useLocationFeature.ts`**
- Fetch all three flags in a single query (`in('feature_key', [...])`).
- Expose: `isLocationEnabled`, `isCameraEnabled`, `isCheckInEnabled` (= location OR camera), and `loading`.
- Realtime subscription listens for changes on any of the three keys.

**`src/components/VisitCard.tsx`**
- Show the Check-In / Check-Out button when `isCheckInEnabled` is true (instead of only `isLocationEnabled`).
- Open the `CameraCapture` modal only when `isCameraEnabled` is true; otherwise skip selfie and proceed.
- Capture GPS coordinates only when `isLocationEnabled` is true; otherwise mark checked-in without lat/lng.
- Blue help banner text adapts: "Location Required", "Camera Required", or "Location & Camera Required".
- Permission-error messages mention only the relevant permission(s).

**`src/pages/MyVisits.tsx`**
- Use `isCheckInEnabled` where the page currently uses `isLocationEnabled` for visit-check-in gating.

No changes to `check_in_mandatory_for_order` or attendance-level flags — those are separate.

## Feature Management UI

No structural changes — `src/pages/FeatureManagement.tsx` already renders each flag's `feature_name` and `description` from the table, so the new richer descriptions show automatically once the migration runs.

## Verification

1. Open `/feature-management` → both new rows visible with clear descriptions; legacy row marked Legacy.
2. Toggle scenarios on a test rep account:
   - Location ON, Camera OFF → Check-In works without selfie, GPS captured.
   - Location OFF, Camera ON → Check-In opens camera, selfie stored, no GPS recorded.
   - Both ON → current behavior (selfie + GPS).
   - Both OFF → Check-In / Check-Out buttons hidden on the visit card.
3. Realtime: flipping a flag in another tab updates the open visit card without reload.
