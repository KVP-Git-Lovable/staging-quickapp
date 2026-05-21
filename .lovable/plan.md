## Goal
Restore the "Top Performers" Leaderboard Banner and its Banner History admin section, which were built earlier but never made it into the current `main` branch (and were also dropped from `Dev`).

## Where the code still lives
Found in git history on the backup branch `origin/lovable-backup-dev-1779255862` (tip: `b4e3c72b "Synced code changes to GitHub"`). Final relevant commits:
- `9894992c` — "Added banner history section" (introduced `BannerHistorySection.tsx`, rewrote `LeaderboardBanner.tsx`, mounted section in `NotificationRulesAdmin`)
- `a0f8009b` — "Added ad hoc preview modal" (preview modal inside Banner History)
- `26fd345f` — Last refinement to `LeaderboardBanner.tsx` (tied ranks)
- `98c281b9` — Last refinement to `BannerHistorySection.tsx`

Files NOT present on `main` today, present on the backup branch:
- `src/components/notifications/LeaderboardBanner.tsx`
- `src/components/admin/BannerHistorySection.tsx`

Files present on `main` but missing the banner wiring:
- `src/components/Layout.tsx` — needs `useNotifications().pendingBanner` + `<LeaderboardBanner />` mount
- `src/hooks/useNotifications.ts` — needs `pendingBanner` state + `dismissBanner` callback
- `src/pages/admin/NotificationRulesAdmin.tsx` — needs `<BannerHistorySection />` mount

## Restore Plan

### Step 1 — Pull the two missing files verbatim from the backup branch
```
git show origin/lovable-backup-dev-1779255862:src/components/notifications/LeaderboardBanner.tsx
git show origin/lovable-backup-dev-1779255862:src/components/admin/BannerHistorySection.tsx
```
Write both files to the same paths on the current branch. These are self-contained UI components using existing design tokens, shadcn primitives, and Supabase client — no new deps expected.

### Step 2 — Re-wire `useNotifications.ts`
Port these additions from the backup version (additive, won't touch existing notification list logic):
- `pendingBanner` state + setter
- Realtime/initial-load selection of an unread leaderboard-type notification → set as `pendingBanner`
- `dismissBanner` callback (marks notification read in Supabase, clears state)
- Export both from the hook's return object

### Step 3 — Mount the banner in `Layout.tsx`
Add the import + the conditional render exactly as in backup:
```tsx
const { pendingBanner, dismissBanner } = useNotifications();
{pendingBanner && (
  <LeaderboardBanner notification={pendingBanner} onDismiss={dismissBanner} />
)}
```

### Step 4 — Mount `BannerHistorySection` in `NotificationRulesAdmin.tsx`
Add the import and place `<BannerHistorySection />` in the same position it had on the backup branch (above the rules table). This brings back the History list + the ad-hoc Preview modal.

### Step 5 — Verify
- App boots, no missing imports / type errors.
- `/admin/notification-rules` shows the "Banner History" card with the preview modal.
- A leaderboard-type unread notification triggers the floating Top-Performers banner; dismiss marks it read.

## Technical notes
- No DB schema changes required — the original feature already used existing `notifications` / `notification_rules` tables. If the backup component references a column or RPC that has since been dropped, we'll flag it during Step 1 inspection and adapt minimally (rename, fall back to existing column) rather than reintroducing schema.
- No new packages.
- All restored code goes only on `main` (the branch Lovable syncs). The user's `Dev` branch is not touched.

## Out of scope
- "Fire Now" per-rule trigger (separate request).
- Any redesign — restoring as-is.
