## Diagnosis
The crash is frontend-only, not an RLS or beat-plan insert failure.

`MyVisits` keeps a fallback list while future-date data loads, but the fallback ref is populated with raw database retailer rows (`name`, `phone`) and later returned where the UI expects transformed visit rows (`retailerName`, `phone`). The search/sort logic then calls `retailerName.toLowerCase()`, producing the reported error.

The database already has an insert policy for users creating their own `beat_plans`, so no database change is required.

## Implementation
1. Update the My Visits retailer memo so the fallback cache stores only fully transformed visit-list records, never raw retailer rows.
2. Clear or scope the fallback appropriately when changing dates so retailers from the prior date cannot leak into a future date while loading.
3. Make search and sorting null-safe as a final guard against malformed cached/offline retailer data.
4. Add a focused regression test covering: select a future date → temporary empty sync state → choose/add a beat, confirming the page remains rendered.
5. Validate the future-date interaction and confirm no `toLowerCase` runtime error occurs.