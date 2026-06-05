## Security & Access Control — Add 7 missing UI actions + enable defaults for FSE/SM

### Part 1 — UI registry (`src/components/security/hierarchicalPermissions.ts`)

The `my_beats` module already has the 5 new actions from the previous fix. Only 7 actions remain to be added/renamed:

1. `**my_visit` actions** — append:
  - `action_visit_create` → "Create Visit"
  - `action_visit_edit` → "Edit Visit"
2. `**all_retailers` actions** — rename existing entry:
  - Replace `action_retailer_add` ("Add Retailer") with `action_retailer_create` ("Add / Create Retailer"). RLS uses `action_retailer_create`; the old key stays in DB but is no longer exposed in the UI.
3. `**primary_orders` actions** — append:
  - `action_order_edit` → "Edit Order"
4. `**check_schemes` actions** — append:
  - `action_scheme_create` → "Create Scheme"
  - `action_scheme_edit` → "Edit Scheme"
  - `action_scheme_delete` → "Delete Scheme"

No other files need code changes — `RolePermissionsTab`, `HierarchicalPermissionEditor`, and `permissionValidator` all read from this registry, so the new rows will show up automatically in Security & Access Control and the dev validator.

### Out of scope

- No changes to RLS policies, `usePermissions`, or any feature code.
- No new DB columns or seeding of profile rows that don't already exist (the 4 actions are already present in `profile_object_permissions` per the audit).
- The "Going Forward Checklist" is documentation guidance only — not implemented as code in this change.

### Verification

- Open Security & Access Control → Role Permissions → each profile → confirm the 7 new rows render under My Visit / All Retailers / Primary Orders / Check Schemes.
- Dev console: `permissionValidator` should no longer warn about these keys.
- After SQL, the verification SELECT returns 8 rows with the expected `can_create`/`can_edit` = true for FSE + SM.