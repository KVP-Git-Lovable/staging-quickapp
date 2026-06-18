# Warehouse addresses + shipping address picker for Primary Order

Two-part change: enrich the Warehouse master with full address + geolocation, and rebuild the Shipping Address control in Create Primary Order to support three sources (Warehouse / Saved / New custom).

---

## 1. Database

### 1a. Extend `warehouses`
Add address + geo columns (all nullable so existing rows keep working):

- `address_line1`, `address_line2`, `city`, `state`, `pincode`, `country` (default `'India'`)
- `landmark` (optional)
- `contact_person`, `contact_phone` (optional, used on shipping labels)
- `latitude numeric(10,7)`, `longitude numeric(10,7)`
- `formatted_address text` — denormalized single-line string used when copying to an order

No data migration needed; existing warehouses just show "Address not set" until edited.

### 1b. New table `distributor_saved_addresses`
Saved-addresses repository, scoped per distributor.

Columns: `id`, `distributor_id` (FK), `label` (e.g. "Mumbai branch", "Event – Pune Expo"), `address_line1`, `address_line2`, `city`, `state`, `pincode`, `country`, `landmark`, `contact_person`, `contact_phone`, `latitude`, `longitude`, `formatted_address`, `is_default`, `created_by`, `created_at`, `updated_at`.

GRANTs to `authenticated` + `service_role`, RLS:
- Distributor portal users: read/write rows for their own `distributor_id` (using existing `distributor_users` membership check, mirroring the policy used on `warehouses`).
- Internal admins: full access via `has_role(auth.uid(),'admin')`.

Partial unique index so only one `is_default = true` per distributor.

### 1c. Extend `primary_orders` (snapshot, no FK to source)
Already has `shipping_address text`. Add:
- `shipping_address_source text` — one of `'warehouse' | 'saved' | 'custom'`
- `shipping_warehouse_id uuid` (nullable FK to `warehouses`)
- `shipping_saved_address_id uuid` (nullable FK to `distributor_saved_addresses`, ON DELETE SET NULL)
- `shipping_latitude numeric(10,7)`, `shipping_longitude numeric(10,7)`
- `shipping_contact_person text`, `shipping_contact_phone text`

The existing `shipping_address` text column keeps the formatted snapshot so historical orders stay correct even if the source warehouse/saved address is later edited or deleted.

---

## 2. Reusable components

### 2a. `AddressFormFields` (new, `src/components/common/AddressFormFields.tsx`)
Controlled form block: line1, line2, city, state, pincode, country (default India), landmark, contact person, contact phone. Used by warehouse dialog, saved-address dialog, and the custom-address mode in the order form.

### 2b. `LocationCaptureButton` (new, `src/components/common/LocationCaptureButton.tsx`)
Mirrors the pattern already used in `AddRetailer.tsx` (line ~1359): a button that calls `navigator.geolocation.getCurrentPosition`, fills lat/lng, and shows captured coordinates as a small chip. No map picker UI — same UX as retailer creation, which the user referenced. (If a true map picker is wanted later, we can swap this for a Google Maps component; the user-visible behavior in retailer creation today is "Use current location", so we match that.)

### 2c. `formatAddress(parts)` helper (`src/lib/addressFormat.ts`)
Builds the single-line `formatted_address` from the structured parts, used everywhere we snapshot to the order.

---

## 3. Warehouse master UI updates

Files: `src/components/distributor-portal/inventory/WarehouseManagement.tsx`, `src/hooks/useWarehouses.ts`.

- Add/Edit dialog: keep Name / Code / Default, add `AddressFormFields` + `LocationCaptureButton` underneath.
- Table: add a small "Address" column showing the city + pincode (or "Not set" pill in amber).
- `useWarehouses` create/update accept the new fields and write `formatted_address` via the helper.

Also surface the same dialog wherever warehouses are managed for internal admins (search for other call sites of `useWarehouses` and update if any — currently only the distributor portal uses it).

---

## 4. Shipping Address control in Create Primary Order

File: `src/pages/distributor-portal/CreatePrimaryOrder.tsx` (replace the placeholder block at lines 1198–1221).

New layout inside the existing "Order Details" right column:

```text
Shipping Address (Optional)
( ) Use warehouse address    ( ) Saved address    ( ) New custom address

[depending on choice:]
- Warehouse:  <SearchableSelect of distributor's warehouses, default = is_default one>
              Shows the warehouse's formatted address as a read-only preview card.
              Disabled-with-tooltip if the warehouse has no address yet, with a
              "Add address" link that opens the warehouse edit dialog inline.

- Saved:      <SearchableSelect of distributor_saved_addresses by label>
              Preview card + "Edit" link (opens edit dialog).
              "Manage saved addresses" link -> small drawer with full CRUD.

- Custom:     <AddressFormFields> + <LocationCaptureButton>
              Checkbox: "Save this address for future orders" with a Label input
              that appears when checked. On submit, inserts into
              distributor_saved_addresses first, then snapshots onto the order.
```

State additions:
- `shippingSource: 'warehouse' | 'saved' | 'custom'` (default `'warehouse'`)
- `shippingWarehouseId`, `shippingSavedAddressId`
- `customAddress` (structured object) + `saveCustomAddress` + `customAddressLabel`

Order submit flow:
1. Resolve `{ formatted_address, latitude, longitude, contact_person, contact_phone }` from the chosen source.
2. If custom + save toggle on, insert into `distributor_saved_addresses` and use the new id as `shipping_saved_address_id`.
3. Write all snapshot columns onto `primary_orders` (existing insert call).
4. Block submit with a toast if `Custom` is chosen but line1/city/pincode are empty (shipping itself stays optional — only enforced when the user picked "custom").

The radio defaults to "Use warehouse address" with the default warehouse pre-selected — this makes the common case one click.

---

## 5. Saved-addresses management (lightweight)

Reuse the drawer/dialog opened from the "Manage saved addresses" link in the order form. No separate page needed for v1. Internal staff already have full access via RLS so they can edit through the same surface when impersonating / viewing the distributor.

---

## Files touched

- `supabase/migrations/<new>.sql` — schema changes (1a, 1b, 1c) + GRANTs + RLS
- `src/components/common/AddressFormFields.tsx` (new)
- `src/components/common/LocationCaptureButton.tsx` (new)
- `src/lib/addressFormat.ts` (new)
- `src/components/distributor-portal/inventory/WarehouseManagement.tsx` (extend dialog + table)
- `src/hooks/useWarehouses.ts` (new fields in create/update + read)
- `src/components/distributor-portal/SavedAddressesManager.tsx` (new — CRUD drawer)
- `src/hooks/useSavedAddresses.ts` (new)
- `src/pages/distributor-portal/CreatePrimaryOrder.tsx` (replace shipping block, extend submit)
- `src/pages/PrimaryOrders.tsx` and any order-detail view that prints shipping — pull from the new `shipping_address` snapshot (no change needed if already reading that column).

## Out of scope (call out, don't build)

- A true interactive map picker with draggable pin. Current pattern across the app is "Use current location" only (see `AddRetailer.tsx`). If you want a Google Maps pin-drop picker for warehouses, say so and I'll add it as a follow-up using the existing Google Maps connector.
- Editing shipping address after an order is placed.
- Address validation / pincode auto-fill of city+state. Easy follow-up using the existing pincode_master table if wanted.
