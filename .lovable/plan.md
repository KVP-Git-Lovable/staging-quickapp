
# Employees & Influencer modules

Two new modules under the internal dashboard, plus a phone-OTP Influencer portal. Gamification is intentionally deferred.

---

## 1. Employees module (`/dashboard/employees`)

A single directory view that merges two sources:

- **Live users** — rows from existing `profiles` + `employees` + `work_experiences` (read-only mirror; edits go back to those tables through the existing profile edit surface).
- **Standalone rows** — a new `employee_directory` table for staff who don't log into the app.

Both surface in one searchable, filterable list (name, employee id, department, reports-to, location).

### New table: `employee_directory`
Fields captured on the form:
- `full_name`, `employee_code`, `email`, `phone`
- `department`, `location`
- `reports_to` — self-lookup to `employee_directory.id` **or** a `profiles.id` (nullable pair, one of the two)
- `joining_date`, `previous_experience` (text), `bio` (text)
- `social_links` (jsonb: linkedin, twitter, instagram, facebook, other)
- `follows_company_page` (bool)
- `company_id`, `created_by`, timestamps

Standard GRANTs + RLS: company members read; admins/HR write. Reports-to picker searches across both sources and stores whichever id was chosen.

### UI
- List page with search, department + location filters, "Add employee" button.
- Detail drawer showing all fields, org tree snippet (reports-to chain), previous experience, socials, "Follows company page" badge.
- Add/Edit dialog for standalone rows only; live-user rows link out to the existing profile editor.

---

## 2. Influencer module (`/dashboard/influencers`)

### New tables

**`influencers`**
- `name`, `company`, `phone` (unique per company_id), `email`, `website`
- `role` — enum `plumber | painter | electrician | civil_contractor | architect | mason`
- `region` (text) + optional `territory_id`, `pincode`
- `portal_enabled` (bool), `portal_last_login_at`
- Roll-up cache columns (updated by trigger): `influenced_orders_count`, `influenced_orders_value`
- `company_id`, `created_by`, timestamps, RLS by company.

**`influencer_retailer_map`** — auto-attribution mapping
- `influencer_id`, `retailer_id`, `active` (bool), `since`, `notes`
- Unique on `(influencer_id, retailer_id)`.

**`influencer_referrals`** — leads from portal ("refer a retailer not yet buying")
- `influencer_id`, `retailer_name`, `phone`, `area`, `notes`, `status` (`new | contacted | converted | dropped`), `converted_retailer_id`.

**`influencer_support_requests`** — thin wrapper reusing existing `support_requests` shape but scoped to influencer_id (or add nullable `influencer_id` to `support_requests` — see Technical).

### Orders attribution (both auto + override)

- Add nullable `orders.influencer_id` (+ `primary_orders.influencer_id`).
- On order insert, a trigger fills `influencer_id` from `influencer_retailer_map` when the retailer has exactly one active mapping and the rep didn't set one.
- Rep can pick / clear an influencer on the Cart screen (searchable dropdown, filtered to influencers active in the retailer's region).
- Trigger on `orders` (insert/update/delete of `influencer_id` or `total_amount`) recomputes cached `influenced_orders_count` and `influenced_orders_value` on the influencer row.

### UI
- List page: name, role, phone, region, # influenced orders, ₹ influenced, portal on/off toggle.
- Detail page tabs: **Overview**, **Influenced orders** (child list from `orders` where `influencer_id = this`), **Mapped retailers**, **Referrals**, **Support tickets**.
- Add/Edit dialog with the fields above. "Enable portal" toggle triggers OTP-ready state (no password — phone is the identity, same as customer portal).

---

## 3. Influencer portal (`/influencer-portal`)

Reuses the customer-portal pattern (isolated anon Supabase client, phone OTP, no CRM session bleed).

Sections:
1. **Active schemes** — reads from `product_schemes` filtered to schemes visible to the influencer's region / role (mirrors the customer-portal schemes visibility gating already in place).
2. **Retailers in my region** — retailers where `influencer_retailer_map` links them, or retailers in the same `pincode` / `territory_id`. Read-only cards with contact and last-order date.
3. **Refer a retailer** — form writing to `influencer_referrals`.
4. **Support tickets** — list + create, writing to `influencer_support_requests` (or `support_requests` with `influencer_id`).

Portal layout matches the existing customer-portal shell (mobile-first, 5-tab nav, brand header).

---

## 4. Navigation / access

- Sidebar entries "Employees" and "Influencers" under a new "People" group, gated by feature flag + `can_read` per existing module-visibility pattern.
- Feature flags: `employees_module`, `influencers_module`, `influencer_portal`.

---

## Technical section

**Migrations (single file, in order):**
1. `CREATE TYPE public.influencer_role AS ENUM (...)`.
2. `CREATE TABLE public.employee_directory (...)` + GRANTs + RLS + policies + `updated_at` trigger.
3. `CREATE TABLE public.influencers (...)` + GRANTs + RLS + policies + trigger.
4. `CREATE TABLE public.influencer_retailer_map (...)` + GRANTs + RLS + policies.
5. `CREATE TABLE public.influencer_referrals (...)` + GRANTs + RLS + policies.
6. `ALTER TABLE public.support_requests ADD COLUMN influencer_id uuid NULL REFERENCES public.influencers(id) ON DELETE SET NULL;` + policy update so influencers see only their own via portal RPC.
7. `ALTER TABLE public.orders ADD COLUMN influencer_id uuid NULL REFERENCES public.influencers(id) ON DELETE SET NULL;` (same for `primary_orders`).
8. Trigger `orders_autoattribute_influencer` BEFORE INSERT: if `NEW.influencer_id IS NULL` and exactly one active row in `influencer_retailer_map` for `NEW.retailer_id`, set it.
9. Trigger `influencer_rollup_recalc` AFTER INSERT/UPDATE/DELETE on `orders` → recomputes cached count + value for affected influencer(s). Uses `SECURITY DEFINER` function to bypass RLS on the aggregate query.
10. Feature-flag rows for the three flags.

**RLS shape:**
- Internal tables: `company_id = current_company()` + `has_role` for writes (existing helpers).
- Portal reads (influencer): SECURITY DEFINER RPCs `get_influencer_schemes(p_phone)`, `get_influencer_retailers(p_phone)`, etc., invoked from the anon client — same pattern as customer portal, avoids exposing influencer table directly.

**Frontend:**
- `src/pages/dashboard/employees/` — List, Detail drawer, Add/Edit dialog. Uses existing DataTable + React Query.
- `src/pages/dashboard/influencers/` — List, Detail (tabbed), Add/Edit, mapping manager.
- `src/pages/influencer-portal/` — Login (phone OTP), Home (schemes), Retailers, Refer, Tickets. Isolated `supabaseInfluencer` anon client, mirroring `supabaseCustomerPortal`.
- Cart update: add optional Influencer picker in the order composer (`OrderComposer`/`CartScreen`), stored on submit.
- `src/modules/influencers/` for hooks (`useInfluencers`, `useInfluencerOrders`) and portal hooks.

**Explicitly out of scope this turn:** gamification games/rewards for influencers (deferred per your answer), any voucher/points wiring.

---

## Rollout order once approved
1. Migration (tables + columns + triggers + flags).
2. Employees list + add/edit + directory merge query.
3. Influencer list + detail + child orders + mapping manager + Cart influencer picker.
4. Influencer portal shell + OTP login + four sections.
5. Feature-flag gating + sidebar entries.
