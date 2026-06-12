## Goal
Add a Hide option for each distributor card on the Distributor Master list. Hidden distributors disappear from the list by default and can be brought back via a "Show hidden" toggle. Reversible, list-screen only — selection dropdowns, detail pages, orders, beats, etc. remain unchanged.

## Scope
- File touched: `src/pages/DistributorMaster.tsx` only.
- No DB schema changes. Hidden IDs stored in `localStorage` (per-user, per-device) under key `hiddenDistributorIds`.
- Detail page (`/distributor/:id`), dropdowns, mappings, reports — untouched.

## UX

Header (next to the existing "Remap" / Filter controls):
- New ghost toggle: `Eye` icon → "Show hidden (N)" / "Hide hidden". Only renders when N > 0.

Each `DistributorCard`:
- Small `EyeOff` icon button in the top-right corner (next to the status badge), `stopPropagation` so it doesn't open the detail page.
- Clicking it hides the distributor immediately, with a toast: "Distributor hidden — Undo". Undo restores it.
- When "Show hidden" mode is on, hidden cards render with `opacity-60` and the action becomes an `Eye` (Unhide) button.

Empty state already handled by existing code (filter naturally produces 0 results).

## Implementation sketch

```tsx
// new local state
const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
  try { return new Set(JSON.parse(localStorage.getItem('hiddenDistributorIds') || '[]')); }
  catch { return new Set(); }
});
const [showHidden, setShowHidden] = useState(false);

const persist = (s: Set<string>) => {
  localStorage.setItem('hiddenDistributorIds', JSON.stringify([...s]));
};

const hide = (id: string) => {
  const next = new Set(hiddenIds); next.add(id); setHiddenIds(next); persist(next);
  toast.success('Distributor hidden', {
    action: { label: 'Undo', onClick: () => unhide(id) },
  });
};
const unhide = (id: string) => {
  const next = new Set(hiddenIds); next.delete(id); setHiddenIds(next); persist(next);
};
```

In `getDistributorsByType`, append:
```ts
const matchesHidden = showHidden ? true : !hiddenIds.has(d.id);
return matchesType && matchesSearch && matchesStatus && matchesHidden;
```

In `DistributorCard` add an icon button in the top-right that calls `hide(distributor.id)` or `unhide(...)` depending on `hiddenIds.has(distributor.id)`, with `e.stopPropagation()`.

In the header row, render the toggle:
```tsx
{hiddenIds.size > 0 && (
  <Button variant="ghost" size="sm" onClick={() => setShowHidden(v => !v)}>
    {showHidden ? <EyeOff/> : <Eye/>} {showHidden ? 'Hide hidden' : `Show hidden (${hiddenIds.size})`}
  </Button>
)}
```

## Out of scope
- Cross-device sync of hidden list (would require a new `user_hidden_distributors` table — can be added later if needed).
- Hiding from dropdowns / order flows / reports.
- Bulk hide/unhide UI.
