## Problem

The PriceBookView (and other recent UI changes) are already in the codebase, but users still see the old UI. This is not a build/deploy problem on Lovable's side — frontend changes only go live after clicking **Publish → Update** in the editor, and the preview always serves the latest code. The real culprit is the app's own service worker (`src/service-worker.ts`), which precaches the built JS/CSS and serves stale assets to returning users until its `RUNTIME_CACHE_VERSION` is bumped.

Current version is `v21`. Old clients still hold v21 assets in `CacheStorage` + precache, so even after a republish they keep rendering the old bundle until the SW activates a new version.

## Fix

1. **Bump SW cache version** in `src/service-worker.ts`:
   - `RUNTIME_CACHE_VERSION = 'v22'`
   - This invalidates `api-cache-*`, `images-cache-*`, `dynamic-cache-*`, `navigation-cache-*` from v21 on activate, and Workbox's `cleanupOutdatedCaches()` drops the old precache.

2. **Force one-time hard refresh for existing users** by extending `src/hooks/useStartupCleanup.ts` (or wherever startup runs) to:
   - Read `localStorage.getItem('app_cache_version')`
   - If it != `'v22'`, call `clearApiCache()` from `src/utils/cacheUtils.ts`, then `forceRefresh()`, then write the new version. Runs exactly once per client.

3. **Verify Publish step**: remind the user that after this change lands, they must click **Publish → Update** in the top-right of the editor for the live `bharat-sales-spark.lovable.app` / `sandbox.quickapp.ai` site to receive it. The preview URL updates automatically.

## Out of scope

- No changes to `PriceBookView.tsx` itself — the code is already correct.
- No backend/RPC changes.
- No changes to Vite/Workbox config beyond the version constant.

## Verification

- Open preview in a fresh incognito window → confirm Discount, Your Price, MOQ columns render.
- In an existing tab, reload once → startup cleanup fires, SW activates v22, page reloads, new UI shows.
- DevTools → Application → Cache Storage → only `*-v22` entries remain.
