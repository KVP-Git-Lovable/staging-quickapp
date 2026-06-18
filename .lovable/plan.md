## Issue

On mobile (≤390px), the action bar in `VisitInvoicePDFGenerator` (View / Invoice / Share icons row in Today's Order card) overflows horizontally — the Share group gets cut off by the right edge of the screen.

Root cause: the container uses `flex items-center justify-between gap-4` with **no wrapping**, and the Share section is unconstrained. Two flex-1 buttons + Share label + 3 icon buttons + gaps exceed the available 358px content width.

## Fix

Single file change: `src/components/VisitInvoicePDFGenerator.tsx` (lines 266–329).

- Add `flex-wrap` to the outer row so the Share cluster drops to a new line on narrow screens.
- Give View / Invoice buttons a `min-w-[120px]` so they remain readable when wrapped.
- Make the Share wrapper `w-full sm:w-auto` so it occupies the second line on mobile and right-aligns on ≥sm.
- Add `shrink-0` to the icon buttons so they never get squeezed.
- Keep desktop appearance identical (`sm:justify-between`, `sm:gap-4`).

No logic, props, or DB changes.
