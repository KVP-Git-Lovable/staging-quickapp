## Goal

Add **Avg Order Value** as a new row inside each BeatCard (the card in the screenshot), positioned right after "Last Visit Value".

## Change — `src/components/BeatCard.tsx`

Insert a new row in the "Additional Metrics" block, matching the existing row style (`flex items-center justify-between p-2 bg-muted/20 rounded`, `Package` icon, `text-xs` label, `font-semibold` value):

- Label: `Avg Order Value:`
- Value: from `metrics.avgBusiness` (already provided by `useBeatMetrics`, computed as this-month revenue ÷ this-month order count).
- Formatting: `'...'` while loading; `₹{(n/1000).toFixed(1)}K` when `n ≥ 1000`; else `₹{Math.round(n)}`; `₹0` when no orders.

No changes to `useBeatMetrics`, `beatService`, or the top stat dashboard.
