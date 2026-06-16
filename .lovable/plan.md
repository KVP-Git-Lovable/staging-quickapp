## Part A — Database & Workflow Verification

### Tables touched by Auto Plan

| Table | Purpose | Used by Auto Plan? | Used by regular Visit workflow? |
|---|---|---|---|
| `beat_plans` | Per-user, per-date scheduled beat (cols: `user_id`, `plan_date`, `beat_id`, `beat_name`, `beat_data` jsonb, `joint_sales_manager_id`) | **Yes — read & write** (insert/delete in both `auto-generate-beat-plan` and `save-beat-plan`) | **Yes — read.** `MyVisits.tsx` (lines 505, 538), `useVisitsData.ts` (237), `useVisitsDataOptimized.ts` (620, 1243, 1379) |
| `beats` | Master list of active beats per user | Read only (`owner_id`/`user_id`, `is_active=true`) | Read in MyVisits, Beat Management |
| `retailers` | Retailer info used to score the plan | Read only | Read everywhere |
| `orders` (last 90 days) | Pattern/value scoring | Read only | — |
| `visits` (last 90 days) | Pattern scoring + visit history | Read only | Source of My Visits |
| `ai_autonomous_actions` | Audit/undo log for each generated plan | **Insert** | Used by AI-action history view |
| `profiles` | Resolve the user being planned for | Read only | — |
| `daily_beat_plans` | **Admin/coordinator** assignments (separate workflow) | **Not used** | Used only by Beat Coordinator admin pages — out of scope |

**Conclusion:** Auto Plan writes to the **same `beat_plans` table** that My Visits reads from. There is no parallel/duplicate table. Saved auto-plans appear immediately in My Visits week view, Beat Visit Calendar, and Performance Calendar. No trigger sync is needed.

### What is dynamic vs hardcoded

- `userId` — always passed from the caller (`useAuth().user.id`); never hardcoded.
- `beats` list — fetched live from `beats` table for the signed-in user.
- Default date range — derived from `today` and `startOfWeek` (date-fns), not a literal date.
- Scoring weights & day caps live in `auto-generate-beat-plan/index.ts` as scoring constants (intentional algorithm tuning, not data). Will be exposed in the UI through Recommendation #3 caps (see below).
- Skip-Sunday off-day rule is a fixed business rule in the engine — documented, not data-driven (can later be moved to `working_days_config` if needed; out of scope).
- The `auto_generated: true` marker inside `beat_data` jsonb is the only thing distinguishing auto-plan rows from manual ones — used by both writers and the deletion guard.

---

## Part B — 9 UX Enhancements to `AutoPlanPreview`

All changes are frontend-only except where noted. No new tables, no schema migrations.

### 1. Unsaved-changes warning
- Track a `isDirty` flag (set true on any drag/remove/replace; cleared on Save or Discard).
- `useEffect` adds a `beforeunload` listener that triggers the browser's native confirm when `isDirty`.
- React Router navigation guard via `useBlocker` (react-router v6.4+) showing an `AlertDialog`: *"You have unsaved changes. Are you sure you want to leave?"* with Stay / Leave buttons.

### 2. Regenerate Preview button
- Already present as "Regenerate Preview". Wrap its click in an `AlertDialog` when `isDirty`: *"This will discard your manual changes and generate a fresh draft. Continue?"* Confirming runs the existing `handleGenerate()` and resets `isDirty`.
- If no edits exist, regenerate runs immediately without a prompt.

### 3. Day capacity validation (one beat per day)
- Drag-and-drop already swaps rather than stacks, so multi-beat per day is impossible by design. Make this explicit:
  - In `replaceBeat()`, ensure we always overwrite — never append.
  - Add a `maxRetailersPerDay` soft limit (default 60, read from existing `working_days_config` if a column exists; otherwise a constant). Show a yellow warning badge on any cell over the limit. Hard rule stays: one beat per day.
- Add inline help text above the grid: *"Each day holds one beat. Drag to swap, dropdown to replace."*

### 4. Preview summary panel
- Replace the small chip row with a full **summary card** above the calendar grid showing:
  - Planning Period: `From → To (N days)`
  - Assigned Beats: `X`
  - Empty Days: `Y`
  - Pre-scheduled (Locked): `Z`
  - Estimated Retailers: `…`
  - Estimated Value: `₹…`
- Counts auto-update as user edits.

### 5. Save confirmation toast + dialog
- On successful save show a richer `Dialog` (not just toast) with:
  - Header: *"Plan saved"*
  - Body: *"Plan successfully created for `01-Jul-2026` to `14-Jul-2026`. `12` visits scheduled, `2` pre-scheduled days preserved."*
  - Buttons: **View My Visits** (→ `/visits/retailers`) and **View Rationale** (→ `/auto-plan-rationale`).

### 6. Existing-plan replacement warning (pre-save)
- Before opening the preview page (or on first generate), call a lightweight count query:
  ```ts
  supabase.from('beat_plans')
    .select('id, plan_date, beat_data', { count: 'exact', head: false })
    .eq('user_id', userId)
    .gte('plan_date', fromDate).lte('plan_date', toDate)
  ```
- Group results into `autoCount` (where `beat_data.auto_generated === true`) and `manualCount`.
- Show a yellow **info banner** above the grid: *"Saving will replace `N` existing auto-generated plans in this range. `M` manual / pre-scheduled visits will not be affected."*
- Repeat the same line inside the Save confirmation `AlertDialog` shown before the actual save call. Save proceeds only after the user confirms.

### 7. Mobile usability — action menu fallback
- On each day card, render a small **kebab button** (`MoreVertical` icon) that opens a `DropdownMenu` with:
  - Move to… (sub-menu listing other days within the range; on selection, swap)
  - Replace Beat… (opens the same beat picker)
  - Remove Beat
- Visible on all sizes (drag-and-drop stays on top). On `lg:` breakpoints we keep the existing inline dropdown + trash icon. On smaller screens the kebab becomes the primary control.
- Drag-and-drop continues to work on desktop; mobile users get equivalent capability via the menu.

### 8. Empty-day quick fill
- Already partially in place. Polish: render a prominent dashed `+ Add Beat` button (full width of the card) instead of just a select. Click opens the beat picker via the same `DropdownMenu` from #7. Sets the day to that beat with empty retailers / 0 value (engine score not re-run on manual add — documented).

### 9. "Draft Preview — Not Yet Saved" indicator
- Sticky banner at top of the page (under the header) with amber background, icon, and text: *"Draft Preview — Not yet saved. Click Save Plan to apply."*
- Visible whenever `hasPreview === true` and not currently saving.
- Add a matching `Draft` watermark badge on each card to reinforce.

---

## Files to change

- `src/pages/AutoPlanPreview.tsx` — all 9 items above.
- `src/App.tsx` — no change (route already wired).
- No edge function changes needed; `save-beat-plan` already replaces auto-only rows in the range and preserves manual rows (verified against `beat_plans` data model).
- No DB migration required.

## Out of scope

- Refactoring scoring algorithm or moving Sunday-off rule into `working_days_config`.
- Syncing `daily_beat_plans` (coordinator workflow) with auto plans — separate workflow.
- Persisting drafts server-side across sessions (still in-memory only).
