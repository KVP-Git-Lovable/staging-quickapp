## What the error is

The preview is blank because the app crashes on first render:

```
TypeError: Cannot read properties of null (reading 'useEffect')
  at App (/src/App.tsx:430:5)
Warning: Invalid hook call ... more than one copy of React
```

What I verified:

- `src/App.tsx` around line 430 is plain JSX (`<CurrencyProvider>` inside the provider tree) — no hook is being called illegally there. The only hook in `App` is a normal top-level `useEffect`.
- `package.json` pins `react` and `react-dom` at `^18.3.1`, and `node_modules` contains exactly one copy of each (both 18.3.1). No nested/duplicate React install.
- `react-i18next@16.5.4` peer range is `react >= 16.8.0`, so it is compatible.

So the "more than one copy of React" warning is not coming from the dependency tree — it is coming from Vite's pre-bundled dependency cache (`node_modules/.vite/deps`, the `chunk-QCHXOAYK` / `chunk-T2SWDQEL` files in the stack trace). React's internal dispatcher resolves to `null` because the optimized bundle was rebuilt inconsistently, most likely after recent package changes. This is a build-cache problem, not an application-code problem.

## Fix

1. Stop treating this as an App.tsx bug — no source changes needed.
2. Clear the stale Vite optimize cache (`node_modules/.vite`) and restart the dev server so React gets pre-bundled cleanly once.
3. Reload the preview and confirm the app renders past `App` with no "Invalid hook call" in the console.
4. If (and only if) the error survives a clean cache, escalate to a dependency reinstall and re-check for a second React copy pulled in transitively — I'll report findings before making any dependency change.

## Notes

No application logic, UI, or dependency versions are changed by this plan.
