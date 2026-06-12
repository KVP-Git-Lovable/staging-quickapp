# Unit Master Configuration - No Defaults

**Migration Applied:** `remove_default_units_allow_all_toggleable`
**Date:** 2026-06-12

## What Changed

### Before
- LITRE: `is_default=true`, `is_default_sales=true`
- PIECE: `is_default=true`, `is_default_sales=true`
- Some units had NULL entries in `enabled_units` table
- Admin couldn't fully control unit availability

### After
- ✅ ALL units have `is_default=false`
- ✅ ALL units have `is_default_sales=false`
- ✅ ALL units have `is_default_purchase=false`
- ✅ ALL 41 units have entries in `enabled_units` table
- ✅ Admin can enable/disable ANY unit independently

## How It Works Now

**UOM Master Structure:**
```
uom_master table (41 units)
    ↓ (id reference)
enabled_units table (41 entries)
    ├─ enabled: boolean (toggle on/off)
    ├─ is_default: false (always)
    ├─ is_default_sales: false (always)
    └─ is_default_purchase: false (always)
```

**Admin Control:**
1. Admin goes to UOM Master page
2. Toggles units ON/OFF
3. Updates `enabled_units.enabled` column
4. Changes apply immediately to order forms
5. Order forms show ONLY enabled units

## Order Form Behavior

**useUnitMaster Hook:**
```typescript
// Fetches only enabled units
SELECT * FROM uom_master
WHERE enabled_units.enabled = true
```

**Display:**
- Shows only units where `enabled_units.enabled = true`
- Respects admin's toggle settings
- No forced defaults
- Full flexibility

## Key Points

- ✅ No unit is forced as default
- ✅ All units can be disabled
- ✅ All units can be enabled
- ✅ Clean, flexible design
- ✅ Admin has full control
- ✅ Currently enabled: LITRE, MILLIGRAM, MILLIMETER, PIECE
- ✅ Currently disabled: all others (admin can toggle)

## Testing

Verify in admin panel:
1. Go to UOM Master page
2. See all 41 units with toggle switches
3. Toggle some units OFF
4. Go to order form
5. Confirm toggled units don't appear in dropdown
6. Toggle units back ON
7. Confirm they reappear in dropdown
