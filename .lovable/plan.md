## Goal

Add a rotating "insight ticker" strip directly under the "Welcome to QuickApp Copilot!" header bar and immediately above the chat window on `/copilot`. It cycles every 3 seconds through three insight slides, then loops.

## Slides

1. **Declining retailers** — top 5 retailers of the signed-in user whose purchase value in the last 30 days dropped most vs the prior 30 days.
2. **Low-yield visits** — retailers where the most time was spent (check-in → check-out duration, last 90 days) but the resulting order value is very low (or zero).
3. **Slow movers** — bottom 3 products by sales value/quantity over the last 90 days (among products that appear in the user's orders).

Each slide shows a short label ("Declining purchases", "High time, low value", "Slow-moving products") followed by the names with a compact metric (e.g. `Sharma Stores ↓ 42%`, `Gupta Traders · 48m · ₹0`, `Product X · ₹1,200`).

## Look

- Background: creamy white-to-yellow gradient (added as design tokens in `index.css`, not hardcoded classes).
- Fonts: blue for the slide label, brown for the metric values, black for retailer/product names.
- Single-line, horizontally scrollable on small screens; smooth fade/slide transition between slides; pauses on hover.
- Height kept slim (~40px) so the chat area is barely affected.

## Technical

- New hook `src/modules/copilot/hooks/useCopilotTicker.ts`
  - Scoped to `auth.getUser()` like the existing `useCopilotInsights`.
  - Single `orders` read (`retailer_id, visit_id, total_amount, order_date, status`, cancelled excluded) covering the last ~180 days, plus:
    - `visits` (`id, retailer_id, check_in_time, check_out_time`) for slide 2 duration,
    - `order_items` (`product_id, product_name, total, quantity`) joined by order id for slide 3,
    - `retailers` name lookup for the ids actually used.
  - All aggregation done client-side in memory (same pattern as the current insights hook); returns `{ declining, lowYield, slowMovers, loading }`.
- New component `src/modules/copilot/components/panel/CopilotTicker.tsx` handling the 3-second rotation and styling.
- `CopilotPage.tsx`: render `<CopilotTicker />` between the header `div` and the `flex-1 min-h-0` chat container. No other logic touched.
- Empty/loading states render a neutral single line ("Gathering your insights…" / "Not enough data yet") so the strip never collapses or errors.

Currency values use the existing `useCurrency().format()` helper. No database or edge-function changes.
