## Operations Configuration Tab

Add a two-tab layout to the Operations page (Overview + Configuration) and build the settings UI backed by the existing `operations_config` row.

### 1. `src/pages/Operations.tsx` — two-tab wrapper

- Import `Tabs, TabsList, TabsTrigger, TabsContent` (already imported) and `usePermissions`.
- Introduce a top-level tab state `operationsTopTab` ('overview' | 'configuration'), persisted to `localStorage` under `operations_top_tab`.
- Inside the `Layout` render:
  - `<Tabs value={operationsTopTab} onValueChange={...}>` with two triggers: **Overview** and **Configuration**.
  - `<TabsContent value="overview">` wraps the entire existing page body unchanged (all current filters, summary boxes, sub-tabs, tables).
  - `<TabsContent value="configuration">` renders:
    - If `can('operations_config','edit')` → `<OperationsConfig />`.
    - Else → a centered muted `<Card>` with "You don't have access to Operations configuration."
- No admin/role checks are added or removed elsewhere.

### 2. `src/components/operations/OperationsConfig.tsx` — new component

Loads the single row `operations_config` where `id = 1` on mount into local `config` state. Each control writes back only its own field:

```
await supabase.from('operations_config')
  .update({ [field]: value, updated_at: new Date().toISOString(), updated_by: user.id })
  .eq('id', 1);
toast.success('Saved');
```

Follows the pattern used in `CreditManagementConfig.tsx` (read-one, per-field update, sonner toast). Shows a skeleton/spinner while loading.

#### Layout

Vertical stack of four `<Card>`s inside a `max-w-4xl` container:

**Card 1 — Backdated orders**
- Header row: title + `Switch` bound to `backdate_enabled`.
- When enabled: `Select` `backdate_mode` (Direct / Approval), numeric `Input` `backdate_max_days`, `Switch` `backdate_require_reason`.
- Helper text: "Backdated orders skip GPS."
- Footer: profile-count badge + "Manage who can use this →" for object `order_backdate`.

**Card 2 — Order on behalf**
- `Switch` `on_behalf_enabled`.
- Helper text: "Credited to the selected user; recorded against whoever places it."
- Footer: badge + link for `order_on_behalf`.

**Card 3 — Out-of-beat orders**
- `Switch` `oob_enabled`.
- When enabled:
  - `RadioGroup` `oob_visibility` with 4 options: Today's beat / Assigned retailers / Assigned territory / All retailers *(managers only)*.
  - Switches: `oob_require_reason`, `oob_require_gps`, `oob_notify_manager`, `oob_allow_offline`.
  - `Select` `oob_credit_rule` (Collector / Owner).
  - Helper under Allow-offline: "All-retailers search is online only."
- Footer: badge + link for `order_out_of_beat`.

**Card 4 — Order edit policy**
- `Switch` `edit_enabled`.
- When enabled:
  - `Select` `edit_lock_point` (Until invoiced / Until dispatched / Same day / Within X hours). When `hours`, show numeric `Input` `edit_lock_hours`.
  - `Select` `edit_who` (Own / Own + team / Anyone with permission).
  - `Switch` `edit_require_reason`.
  - `Switch` `edit_require_approval`; when on, numeric `Input` `edit_approval_threshold`.
  - `Switch` `edit_lock_price`.
  - Numeric `Input` `edit_max_edits` with helper "0 = unlimited".
- Footer: badge + link for `order_edit`.

#### Card-footer "Manage access" helper

On mount, run one query:

```
supabase.from('profile_object_permissions')
  .select('object_name, profile_id')
  .in('object_name', ['order_backdate','order_on_behalf','order_out_of_beat','order_edit'])
```

Compute distinct `profile_id` count per `object_name` client-side and render `<Badge variant="secondary">{N} profiles have access</Badge>` next to a `Button variant="link"` that calls `navigate('/security-management')`. If the query errors, render only the "Manage access" link (no count).

### Technical notes

- All controls use existing shadcn primitives (`Card`, `Switch`, `Input`, `Select`, `RadioGroup`, `Button`, `Badge`, `Label`) — no new UI dependencies.
- Numeric inputs coerce via `Number(e.target.value)` and clamp with `Math.max(0, ...)` before saving.
- Per-field save avoids a global "Save" button and matches how other settings screens in the app persist changes.
- No DB migrations, RLS changes, or edits to `permissionModules.ts` / `grantAllToSystemAdmin` — those are already in place from prior steps.
- No changes to `useAdminAccess`, role checks, or any other module.
