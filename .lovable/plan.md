# Copilot: Right Panel + Welcome Redesign

## 1. New Right Sidebar (`CopilotUtilityPanel.tsx`)

Fixed-width (~260px) panel on the right of `CopilotPage`, light grey background (`bg-muted/40`). Chat window shrinks to accommodate. Hidden on mobile (`hidden lg:flex`).

### 1a. Orders chart (last 7 days)
- New hook `useMyOrdersLast7Days`: queries `orders` where `user_id = auth.uid()`, `order_date >= today-6`, status not cancelled. Joins `order_items` to sum quantity converted to KG (use existing `uomQuantity` helper if available; fallback to `quantity` field assuming KG).
- Render with `recharts` `<AreaChart>` (already in deps via shadcn `chart`): X = date (dd MMM), Y = KG. Compact ~180px tall, gradient fill (navy→transparent), no legend, minimal axes.
- Wrap in a `<button>` navigating to `/analytics` on click. Hover ring for affordance.
- Title: "Orders · Last 7 days (KG)".

### 1b. Ticket Assistant
- Section header "Ticket Assistant".
- 4 category cards, each showing English + Hindi label, colored backgrounds:
  - App Issues / ऐप समस्या — pink (`bg-pink-100 text-pink-900`)
  - Not able to place order / ऑर्डर नहीं कर पा रहे — light blue (`bg-sky-100 text-sky-900`)
  - Cannot create Retailer / रिटेलर नहीं बन रहा — amber (`bg-amber-100 text-amber-900`)
  - Issues with Beat / बीट में समस्या — violet (`bg-violet-100 text-violet-900`)
- Clicking opens a shadcn `<Dialog>` (`TicketStubDialog`) with:
  - Category name, logged-in user name/email (from `profiles`)
  - Auto-generated ticket ID (`TCK-` + timestamp)
  - Optional textarea for note
  - "Submit" button → toast "Ticket raised (demo)" and closes. No DB write.

## 2. Welcome Screen Redesign (`WelcomeHeader.tsx` + `ChatWindow.tsx`)

- Remove the 3 static prompt cards from empty state (keep `PromptCardGrid` chips row above composer for non-empty state as-is).
- Empty state now shows:
  - Blue circular Copilot icon (~72px, `bg-primary` navy or blue-500, white `Bot` lucide icon, subtle glow).
  - Text below: `Hi {firstName}! I am your QuickApp Copilot`.
  - After 3s, swap text to Hindi: `नमस्ते {firstName}! मैं आपका QuickApp Copilot हूँ`.
  - Toggle continues alternating every 3s (fade transition).
- `firstName` from `profiles.full_name` (first token) fallback to email prefix.

## 3. Layout wiring (`CopilotPage.tsx`)

```
[Sidebar 256] [Chat main flex-1] [UtilityPanel 260 lg+]
```

## Technical notes
- New files: `src/modules/copilot/components/panel/CopilotUtilityPanel.tsx`, `TicketStubDialog.tsx`, `OrdersChart.tsx`; `src/modules/copilot/hooks/useMyOrdersLast7Days.ts`.
- Edits: `CopilotPage.tsx` (add panel), `ChatWindow.tsx` (drop PromptCardGrid from empty state), `WelcomeHeader.tsx` (icon + bilingual rotating greeting via `setInterval`).
- Chart uses existing `recharts` dep.
- No backend/schema changes.
