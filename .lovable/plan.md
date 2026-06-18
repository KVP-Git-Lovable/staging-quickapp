# Visual refresh — Create Primary Order page

A tasteful color + depth pass on `src/pages/distributor-portal/CreatePrimaryOrder.tsx`. No layout/functionality changes — only styling.

## Direction: Indigo Corporate

Brand accent: **Indigo** (already the project's primary). Status colors: emerald (success / within limit), amber (warning), rose (destructive). Cards stay white with slate-200 borders and subtle shadow. Page background switches from flat white to a very soft `bg-slate-50/60`.

## Specific tweaks

1. **Page header card** — left-border accent in indigo (3px), item count rendered as an indigo pill (`bg-indigo-50 text-indigo-700`).

2. **Stepper card**
   - Completed step: filled emerald circle with check
   - Active step: filled indigo-600 circle with soft `ring-4 ring-indigo-100` glow
   - Pending: slate-100 background, slate-500 number
   - Connector lines tinted indigo up to current step, slate-200 after

3. **Section cards** (Add Products, Order Items, Order Summary, Credit Validation) — colored icon chip in the header (indigo-50 background, indigo-600 icon), section title in slate-900, header strip gets a faint `bg-slate-50/50` band.

4. **Order Items table**
   - Header row: `bg-slate-50`, uppercase tracking-wider slate-500 labels
   - Row hover: `hover:bg-indigo-50/30`
   - Price-source pill: amber tinted (`bg-amber-50 text-amber-700 ring-1 ring-amber-200`)
   - Line total in slate-900 bold

5. **Order Summary card** — Grand Total row gets an indigo tinted highlight band (`bg-indigo-50/60 border border-indigo-100 rounded-lg`) with the total in `text-indigo-700 font-black`.

6. **Credit Validation card**
   - "Within Limit" badge: emerald (`bg-emerald-50 text-emerald-700 ring-emerald-200`)
   - Add a thin utilization progress bar (emerald < 70%, amber 70–90%, rose > 90%)
   - Outstanding amount in rose-600 when > 0

7. **Sticky bottom bar** — rounded `rounded-2xl`, stronger `shadow-xl`, Grand Total label in indigo, value in slate-900 bold. Submit button stays the existing dark CTA but gets a soft `shadow-lg shadow-slate-300/60`.

8. **"Add New Row" button** — dashed border that lights up indigo on hover (`hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-600`).

All values use existing Tailwind tokens — no new design-system colors needed.

## Files touched
- `src/pages/distributor-portal/CreatePrimaryOrder.tsx` (className edits only)

If you'd rather see rendered mockups before I build, tell me and I'll retry the preview picker.
