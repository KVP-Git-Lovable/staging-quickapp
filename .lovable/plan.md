# Add header bar to Feature Management

The Feature Management page renders its own content without the shared app header, while sibling admin pages (e.g. Admin Controls) wrap themselves in `<Layout>` from `@/components/Layout`, which is what renders the top header bar / nav.

## Change

**File:** `src/pages/FeatureManagement.tsx`

1. Add `import { Layout } from '@/components/Layout';` to the imports.
2. Wrap every `return (...)` in the component with `<Layout>...</Layout>`:
   - the loading spinner branch
   - (no need to wrap the `<Navigate />` redirect)
   - the main page content branch

No other file or logic changes. The page's existing back arrow, title, tabs, and content stay exactly as they are — they just render inside the standard app shell now.

## Verification

- Open `/feature-management` → the same top header bar visible on `/admin-controls` and other internal pages now appears above the "Feature Management" title.
- Tabs (Global Features / By Company / By Role / By User / Dependencies / Audit Log) still switch correctly.
- Back arrow still navigates back.
