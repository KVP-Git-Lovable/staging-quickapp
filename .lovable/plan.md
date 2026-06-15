# Feature Management System — Multi-Company

Build a per-company feature toggle system on top of the existing `feature_flags` infrastructure. Toggles only (no JSON config). Three role-based UIs. Automatic dependency resolution.

## Guiding principle
Do NOT create a parallel `features` table. The project already has `feature_flags` (25 rows), `useFeatureFlags` hook, `FeatureManagement.tsx` admin page, and a `feature_flag_audit` table. We extend, we don't replace.

## Effective-state resolution
For any (company, feature):
1. If `feature_flags.is_enabled = false` globally → OFF (kill switch).
2. Else if `company_feature_config.is_enabled` is set → use that.
3. Else → ON (default opt-in for new companies).
4. After step 1-3, if any dependency resolves to OFF → feature is **blocked** (effective OFF, surfaced with `blockedBy[]`).

---

## Phase 1 — Database

### New tables
- **`company_feature_config`** — `(company_id, feature_id)` unique. Columns: `is_enabled boolean NULL` (NULL = inherit), `updated_by`, timestamps.
- **`feature_dependencies`** — `(feature_id, depends_on_feature_id)` unique. Columns: `dependency_type` ('hard' blocks / 'soft' warns), `description`.

### Reuse
- `feature_flags` — master registry, unchanged schema.
- `feature_flag_audit` — extend with nullable `company_id` column so per-company toggles also log here.

### RPC (SECURITY DEFINER)
- `get_effective_features(p_company_id uuid)` → returns rows of `{ feature_key, enabled, blocked_by text[], category, description }`. Does the global × company × dependency merge server-side so the client gets one clean payload.
- `set_company_feature(p_company_id, p_feature_key, p_enabled, p_cascade boolean)` → upserts `company_feature_config`, optionally auto-enables hard dependencies, writes to `feature_flag_audit`.

### RLS
- `company_feature_config`: super-admin (`is_system`) all; company manager (new permission `feature_company_manage`) only own `company_id`; others read-only own company.
- `feature_dependencies`: read all authenticated; write super-admin only.
- Audit log: super-admin reads all; company manager reads own company.

### Grants
Standard `authenticated` SELECT + scoped INSERT/UPDATE via RPC; `service_role` all.

---

## Phase 2 — Hook & Context

### `src/context/FeatureContext.tsx` (new)
- On auth load, calls `get_effective_features(currentCompanyId)` once.
- Caches in memory + localStorage (same pattern as existing `feature_flags_cache`).
- Exposes `{ features: Map, isLoading, refresh() }`.
- Wrapped in `App.tsx` above the router.

### `src/hooks/useFeature.ts` (new)
- `useFeature(key)` → `{ enabled, blockedBy, isLoading }` reading from context.
- `useFeatureDependencies(key)` → `{ canEnable, blockedBy[] }`.
- Keep existing `useFeatureFlags` for the admin/global view; new hook is the per-company runtime API.

---

## Phase 3 — Components (`src/components/features/`)

All six as spec'd, minus config:
- `FeatureGate` — `<FeatureGate feature="x" fallback={…}>children</FeatureGate>`. Shows `Skeleton` while loading.
- `FeatureToggle` — switch with disabled state when blocked by deps.
- `DependencyWarning` — yellow alert listing missing prerequisites.
- `FeatureCard` — name, description, category badge, status, toggle.
- `FeatureConfigDisplay` — read-only status pill (no JSON since config is out of scope).
- (Skip `FeatureConfigEditor` — not needed.)

---

## Phase 4 — UI pages

### Page A — Super-admin (extend existing `src/pages/FeatureManagement.tsx`)
Add tabs to the existing page:
- **Global** (existing module-grouped toggle UI, unchanged).
- **By Company** — company selector → list of all features with per-company override state (Inherit / Force On / Force Off), dependency cascade prompt on toggle.
- **Dependencies** — table of `feature_dependencies`, create/edit/delete.
- **Audit Log** — paginated `feature_flag_audit` reader with filters (company, feature, date).

### Page B — Company manager (new tab in `src/pages/CompanyProfile.tsx`)
New tab "Features":
- Summary cards: Total / Enabled / Blocked.
- List of features scoped to their company, each as a `FeatureCard` with toggle.
- Toggling saves immediately via `set_company_feature` RPC; toast on success/error.
- Blocked features show `DependencyWarning` and disabled toggle.
- Visible only to users with the `feature_company_manage` permission.

### Page C — End user (new section in `src/pages/UserProfile.tsx`)
Read-only "Features Available to Me" section:
- For each feature: name, plain-language description, ✓ Enabled / ✗ Not enabled.
- No toggles, no admin links.

---

## Phase 5 — Adoption
- Do NOT mass-refactor existing `isFeatureEnabled()` call sites. Leave them; they keep working against global flags.
- New code should prefer `<FeatureGate>` / `useFeature()`.
- Document the migration path in `README.md` under a new "Feature Management" section.

---

## Out of scope (per your answers)
- `config_json` payloads and `FeatureConfigEditor` — toggles only.
- New edge functions — RPCs + RLS are sufficient and match project conventions.
- New `/admin/settings/features` route — we extend `/admin-controls` ➝ FeatureManagement.

## Technical notes
- Multi-company today contains 1 row in `companies`; design must still work when that grows to 100+.
- Permission key `feature_company_manage` to be added to `profile_object_permissions` seed for default admin profiles.
- All new RPCs use `p_` param prefix per project standard.
- Audit log writes happen inside `set_company_feature` so we can't bypass logging.

## Deliverables checklist
- [ ] Migration: `company_feature_config`, `feature_dependencies`, `feature_flag_audit.company_id`, RLS, grants, RPCs.
- [ ] `FeatureContext` + `useFeature` + `useFeatureDependencies`.
- [ ] 5 components under `src/components/features/`.
- [ ] Extended `FeatureManagement.tsx` with 3 new tabs.
- [ ] New Features tab in `CompanyProfile.tsx`.
- [ ] New section in `UserProfile.tsx`.
- [ ] Permission seed for `feature_company_manage`.
- [ ] README section.
