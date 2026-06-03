## Goal

Apply two fixes against the critical rules audit:

1. **Rule 4** — `DeactivateBeatWizard` destination beats query filters by `user_id` only, hiding beats the user can access via `beat_user_access`.
2. **Rules 1/2 defense-in-depth** — Add `usePermissions()` guards inside the 5 new modals so submit handlers can't run if the user lacks permission (buttons in `BeatCard` are already gated; this hardens the modals themselves).

## Changes

### 1. `src/components/DeactivateBeatWizard.tsx` (lines 81-100)

Replace the single own-beats query with a parallel fetch of:
- Own active beats (`user_id = userId`)
- Accessible beat IDs from `beat_user_access` (active, `effective_to` null or future)

Then fetch shared beats by `beat_id IN (sharedIds)`, merge with own, dedupe by `beat_id`, and use that as the destination list.

### 2. Modal submit guards (additive, no UI change)

Add at the top of each modal component:
```ts
const { can, loading: permLoading } = usePermissions();
```

Gate the submit handler with the matching key (same keys `BeatCard` already uses):

| Modal | Permission key + action |
|---|---|
| `ShareBeatModal` — `handleGrant`/`handleRevoke` | `action_beat_share`, `create` |
| `CoverageModal` — `handleAssign`/`handleEnd` | `action_beat_coverage`, `create` |
| `TransferOwnershipModal` — `handleTransfer` | `action_beat_transfer`, `create` |
| `DeactivateBeatWizard` — confirm handler | `action_beat_delete`, `delete` |
| `BeatHistoryDrawer` — read gate | `module_my_beats`, `read` |

Behavior: if `permLoading` → block submit + toast "Checking permissions…"; if `!can(...)` → toast "You don't have permission" and return early.

## Out of scope

- No DB migrations.
- No changes to `BeatCard` button gating (already correct).
- No changes to `useOfflineRetailers` Message 12 work.
- No changes to `beatService` or RLS.
