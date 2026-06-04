## Goal
Add a status filter toggle to **Product Management** so users can switch between viewing **Active**, **Inactive**, or **All** products (and variants). Default view = **Active**.

## DB check (no changes needed)
- `products.is_active` (boolean) — already exists.
- `product_variants.is_active` (boolean) — already exists.
- Current fetch in `ProductManagement.tsx` (`fetchProducts`, line 300) already loads **all** products regardless of status (no `is_active` filter applied). Variants load the same way.
- Purely a **UI filter** — no migration, no RPC change, no edge function change.

## UI changes (single file: `src/components/ProductManagement.tsx`)

1. **New state** next to `searchQuery`:
   ```
   const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
   ```
   Default = `'active'`.

2. **Toggle control** in the toolbar (same row as the search input near line 903), using shadcn `Tabs` or `ToggleGroup`:
   - Active (default)
   - Inactive
   - All
   Show counts next to each label, e.g. `Active (128)`.

3. **Extend `filteredProducts`** (line 852) to apply both search and status filter:
   ```
   const filteredProducts = products.filter(product => {
     const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase())
       || product.sku.toLowerCase().includes(searchQuery.toLowerCase());
     const matchesStatus =
       statusFilter === 'all' ? true :
       statusFilter === 'active' ? product.is_active !== false :
       product.is_active === false;
     return matchesSearch && matchesStatus;
   });
   ```
   Treat `is_active = null/undefined` as **active** (matches the system-wide rule in `PRODUCT_DISPLAY_FLOW.md`).

4. **Reset pagination** when `statusFilter` changes (extend existing reset effect at line 861).

5. **Variants dialog** (line 1626): apply the same status filter to the variant list inside the "View Variants" dialog so it stays consistent with the parent toggle.

6. **Empty state copy**: dynamic message based on filter — e.g. "No active products", "No inactive products", "No products found".

## Out of scope
- No change to Order Entry / Van Stock / Cart filters — they continue to show only active products as defined in `PRODUCT_DISPLAY_FLOW.md`.
- No change to import/export or activate/deactivate flows.
- No DB migration.

## Files touched
- `src/components/ProductManagement.tsx` (only file)
