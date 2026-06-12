## Goal
Make the Check-In/Out button in `VisitCard` respect the per-role `action_attendance_check_in` permission from Security & Access, instead of being controlled only by the global `isLocationEnabled` feature flag.

## Changes

**File:** `src/components/VisitCard.tsx`

1. Add import alongside other hook imports:
   ```ts
   import { usePermissions } from '@/hooks/usePermissions';
   ```

2. Inside the `VisitCard` component (next to other hook calls like `useVanSales`, `useCheckInMandatory`):
   ```ts
   const { can } = usePermissions();
   const canCheckIn = can('action_attendance_check_in');
   ```

3. Update the Check-In/Out button render block (~line 2760) to also gate on the permission, and update the surrounding grid-cols computation so the layout collapses to `grid-cols-3` when the button is hidden:
   ```tsx
   <div className={`grid gap-1.5 sm:gap-2 ${!locationFeatureLoading && isLocationEnabled && canCheckIn ? 'grid-cols-4' : 'grid-cols-3'}`}>
     {!locationFeatureLoading && isLocationEnabled && canCheckIn && (
       <Button ...>Check-In/Out</Button>
     )}
     ...
   </div>
   ```

## Behaviour after fix
- Users with `action_attendance_check_in` permission: button visible (when location feature flag is on).
- Users without the permission: button hidden, row collapses to 3 columns so layout doesn't break.
- Global location feature flag still acts as a master switch.

## Out of scope
- No change to `action_attendance_check_out` wiring (button is a single combined Check-In/Out toggle; check-in permission controls visibility as requested).
- No change to permission definitions or Security & Access UI.
