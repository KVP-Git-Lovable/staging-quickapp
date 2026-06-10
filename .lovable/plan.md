## Add "Verified By" column to Retail Management table

Add a new column showing who verified each retailer and via which method.

### Changes

**1. Data fetch (`src/pages/RetailManagement.tsx` retailers query)**
- Include `verified_by`, `verification_method`, `verified_at` in the select.
- Join/lookup approver name from `profiles` (full_name) keyed by `verified_by`. Use a single batched fetch of profile names for the page's visible rows (avoids N+1) and build an `id → name` map.

**2. Table column (`src/components/retailer/VirtualizedRetailerTable.tsx`)**
- Add a new header "Verified By" between Status and Last Visited.
- Cell rendering rules:
  - If `verified = false` → render muted dash "—".
  - If `verified = true` and `verification_method = 'manual'` → show approver full name + small "Manual" badge. Tooltip with `verified_at` date.
  - If `verification_method = 'whatsapp'` → show "WhatsApp" with a green WhatsApp icon + sub-line "via retailer reply". Tooltip shows phone number replied from and `verified_at`.
  - If `verification_method = 'auto'` or other → show method label.
- Keep column width compact (~160px) and truncate long names.

**3. Reuse existing tick**
- The blue `VerifiedTick` stays in the Name column. The new column adds the human-readable attribution next to it.

### Technical notes
- Profile name map fetched once per retailers page via `supabase.from('profiles').select('id, full_name').in('id', uniqueVerifierIds)`.
- No schema changes; all needed columns already exist on `retailers`.
- No changes to verification flows or policies.
