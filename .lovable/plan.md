## Goal

Add a new section in the Copilot right-hand utility panel, directly below **Ticket Assistant**, that lists all retailers in today's visit plan and generates a friendly, AI-written action plan built from three deterministic signals.

## What the user sees

1. **Today's Visits** header with the date and count.
2. A compact list of every retailer in today's visits (name, beat, visit status, check-in/out time span if available).
3. A button: **"Get my action plan"**. On click, the panel streams back a message like:

   > Hi Rakesh, I have gathered some action points for your today's visit…

   followed by three grouped sections:
   - **Churn risk** — retailers in today's visits with no confirmed orders across their last 3 visits.
   - **Low productivity** — retailers with the lowest order value/order-rate per visit.
   - **Long dwell time** — retailers where `check_out_time − check_in_time` has been highest historically.

   Each section ends with short, diplomatic recommended next steps.

## Technical approach

**New edge function `copilot-visit-actions`** (does not touch `copilot-agent`):
- Auth-scoped like `copilot-agent` (JWT verified in-code, RLS client from the caller's token).
- Deterministic SQL first:
  - Today's visits: `visits` filtered by `user_id` + `planned_date = today`, joined in code to `retailers` (name, beat_name, pending_amount).
  - Churn: for each retailer in today's list, fetch its last 3 completed visits and check whether any linked `orders` row exists with a confirmed status; zero confirmed → churn candidate.
  - Productivity: orders-per-visit and average order value over the last ~90 days per retailer; lowest ranked first.
  - Dwell time: average minutes from `check_out_time − check_in_time` over the same window; highest ranked first.
- The computed facts are passed to Together.AI (same `togetherClient.ts` + `MODEL` from `config.ts`) as an authoritative grounding block with a system instruction to greet the user by first name, stay diplomatic/friendly, use only the supplied figures, and end each group with concrete next steps.
- Response streams back as SSE text tokens, using the same frame format the existing `copilotService` client parser already understands.

**Frontend (new files only, plus one insertion):**
- `src/modules/copilot/hooks/useTodaysVisitRetailers.ts` — fetches today's visits + retailer names for the list rendering.
- `src/modules/copilot/hooks/useVisitActionPlan.ts` — calls the new edge function and exposes `{ text, loading, error, generate }`.
- `src/modules/copilot/components/panel/VisitActionPlan.tsx` — the section UI (retailer list, generate button, streamed markdown output rendered with the existing markdown renderer, loading and error states).
- `CopilotUtilityPanel.tsx` — one added `<VisitActionPlan />` section below the Ticket Assistant block. No other change to that file.

**Empty/edge states:** if no visits are planned today, the section shows "No visits planned for today" and the generate button is hidden. If Together.AI fails, an inline retry message appears — no fabricated data.

## Out of scope

No changes to chat, conversations, orders chart, ticker, sidebar, `copilot-agent`, or any existing hook/logic.
