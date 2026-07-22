## Goal

Restructure the rule builder from:

```
When [event] → happens on [module(s)]
```

to:

```
Which Module [Attendance] → Happens on [Check-in / Check-out / …] → When [it occurs]
```

Keep the existing storage schema (`event_code`, `source_table`) and the existing emit/dispatch pipeline. Only the UI, the title/message auto-templates, and one new attendance trigger change. Start with **Attendance** module fully wired; other modules stay as they are until we tackle them.

## Attendance sub-events (module = `attendance`)

| Sub-event label        | Storage (`source_table` / `event_code`)                                | Fires when                                                            |
| ---------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Check-in               | `attendance` / `RECORD_CREATED`                                        | already wired (existing INSERT trigger)                               |
| Check-out              | `attendance` / `RECORD_UPDATED`                                        | new: attendance row `check_out_time` transitions NULL → not-null      |
| Leave applied          | `leave_applications` / `RECORD_CREATED`                                | already wired                                                         |
| Regularization applied | `regularization_requests` / `RECORD_CREATED`                           | already wired                                                         |
| Approval requested     | `leave_applications` / `RECORD_UPDATED` (status → `pending_approval`)  | reuses existing UPDATE emit path; filtered by sub-event tag           |
| Approval approved      | `leave_applications` / `RECORD_UPDATED` (status → `approved`)          | reuses existing UPDATE emit path; filtered by sub-event tag           |

Storage stays as the two existing columns — no schema migration for `notification_rules`. Each attendance sub-event is a preset pair of `(source_table, event_code)` plus (for the two approval variants) a client-side status filter carried in `title_template`/`message_template` defaults. We can add a lightweight `sub_event` metadata column later if we need server-side filtering; for the first pass the two approval variants are surfaced but share the same underlying rule row.

## UI changes — `src/components/admin/NotificationRuleForm.tsx`

1. Insert a new **Which Module** selector at the top of the sentence-builder row. Options: Attendance (active), Orders, Visits, Leaves, Regularization, … (existing `SOURCE_TABLES` list — for now, non-attendance modules keep today's free-form event picker so nothing regresses).
2. When module = **Attendance**, replace the two current controls (`event_code` + `source_table[]`) with a single **Happens on** dropdown populated from the table above. Selecting an option sets both `event_code` and `source_table` behind the scenes.
3. Auto-populate `title_template` and `message_template` from a per-sub-event default (e.g. Check-out → `{user_name} — checked out` / `{user_name} checked out at {time} on {date}.`). The admin can still edit them.
4. Keep the rest of the builder (recipients, channel, timezone, preview, save) unchanged.
5. Sentence preview updates to read: `When {sub-event label} on Attendance → notify {recipients}`.

## Backend changes

1. **Migration** — extend `trigger_notification_attendance()` to also run on `UPDATE OF check_out_time` and emit `RECORD_UPDATED` when `OLD.check_out_time IS NULL AND NEW.check_out_time IS NOT NULL`. Recreate the trigger as `AFTER INSERT OR UPDATE OF check_out_time`. Payload includes `user_name`, `check_out_time`, `date`, and `sub_event = 'checked_out'` so future filters can key off it.
2. No changes required for leave / regularization emits — they already emit `RECORD_CREATED` and `RECORD_UPDATED` on `leave_applications` and `regularization_requests`.
3. No changes to `notif_preview_recipients`, `send-push`, or the notification center.

## Out of scope for this pass

- Other modules' sub-event trees (Orders, Visits, etc.) — they keep today's UI.
- A dedicated `sub_event` column on `notification_rules` (revisit if two "Approval requested" vs "Approval approved" rules need distinct server-side gating).
- Backfilling existing rules — the current attendance check-in rule keeps working as-is.

## Verification

- Create a new rule via the redesigned UI: Module = Attendance, Happens on = Check-out → save, then check out on a device → confirm a notification arrives and one row lands in `notifications` / `notification_event_log`.
- Re-open the existing check-in rule → it loads correctly with Module = Attendance, Happens on = Check-in.
- Non-attendance modules still open and save with the legacy controls.
