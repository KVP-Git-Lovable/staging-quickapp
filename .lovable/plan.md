Edit `src/components/CoverageModal.tsx` only — no service/business-logic changes.

1. **Interface** — add `is_active?: boolean` to `CoverageRow`.
2. **loadCoverage()** — include `is_active` in the `.select(...)` from `beat_coverage_assignments`.
3. **Bucketing** (render block ~lines 533–539) — rows where `is_active === false` are pulled out and shown in a renamed **History** section, regardless of dates:
   ```ts
   const liveRows = activeCoverage.filter(c => c.is_active !== false);
   const endedRows = activeCoverage.filter(c => c.is_active === false);
   const upcomingCoverage = liveRows.filter(c => c.start_date > today);
   const currentCoverage  = liveRows.filter(c => c.start_date <= today && c.end_date >= today);
   const expiredByDate    = liveRows.filter(c => c.end_date < today);
   const historyCoverage  = [...endedRows, ...expiredByDate];
   ```
4. **UI** — rename the "⚫ Expired" section to "⚫ History" and render `historyCoverage` there (dimmed, no End Coverage button — passed as `isExpired=true`).

Effect: clicking **End Coverage** → `endCoverage()` flips `is_active=false` (unchanged) → modal re-fetches → row immediately leaves Upcoming/Active and shows under History.