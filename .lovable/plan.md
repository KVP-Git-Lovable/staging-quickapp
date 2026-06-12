## Fix WhatsApp verification edge function column name

**File:** `supabase/functions/send-retailer-verification-whatsapp/index.ts`

1. Line 43 — in the `.select(...)` list, change `contact_person` → `contact_name`.
2. Line 62 — change `retailer.contact_person` → `retailer.contact_name` in the `ownerLabel` fallback.

No other files affected. Edge function auto-deploys after the edit.

### Verification
- Add a new retailer with a valid phone via `/add-retailer`.
- Confirm 200 from `send-retailer-verification-whatsapp` and the WhatsApp message arrives.