## Diagnosis

The Operations module is correctly wired in `src/components/security/hierarchicalPermissions.ts` (lines 838–850) as the last entry of `HIERARCHICAL_MODULES`:

```
{ name: 'operations', label: 'Operations',
  fields: [], widgets: [],
  actions: [order_backdate, order_on_behalf, order_out_of_beat, order_edit, operations_config] }
```

`HierarchicalPermissionEditor` builds the Module tab from `HIERARCHICAL_MODULES.map(...)`, so a row labelled **Operations** should appear at the **bottom** of the Module Permission list, below "Beat Coordinator". There is no top-level "Admin - Operations" module competing for the same slot (those are child fields/actions/widgets nested inside `admin_control`).

Most likely cause the row isn't visible to you:
1. The preview is serving a stale bundle (HMR missed the array append).
2. The Module tab is long — the Operations row is at the very end and requires scrolling.

## Plan

1. Drive the running preview with Playwright: open `/security-management` → Role Permissions → Module Permission tab, scroll to the bottom, screenshot, and confirm whether a row labelled "Operations" is present.
2. If the row is present in the DOM but not visible on your screen, report back with the screenshot and the exact position — no code change needed, just a hard refresh / scroll.
3. If the row is genuinely missing from the DOM, inspect why (e.g. an error boundary, a filter I missed, or a duplicate `HIERARCHICAL_MODULES` export shadowing the update) and propose a targeted fix in a follow-up plan.

No files will be modified in this step — this is a verification-only pass.
