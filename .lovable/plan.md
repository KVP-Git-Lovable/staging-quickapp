
## Root cause for Prajwal Genral Store

1. **`retailer_verification_requests` table does not exist** in the database. Both `send-retailer-verification-whatsapp` (insert) and `whatsapp-retailer-verify-inbound` (select) reference it, so:
   - The send-WhatsApp function technically delivered the Twilio message, but its insert into `retailer_verification_requests` silently errored — no pending row was ever recorded.
   - Even if the verify-inbound webhook had been called, it would have found no row and exited.

2. **Twilio routes inbound replies to the conversational WhatsApp bot, not to `whatsapp-retailer-verify-inbound`.** Evidence: `whatsapp_sessions` shows Prajwal's `+917338319619` conversation with two `YES` user turns, each answered by the AI greeting — meaning the bot consumed the verification reply.

Net effect: retailer stays `verified=false`, `verification_method=null`, `verified_by=null`, `verification_score=42`, `quality_status=partial`.

## Fix

### 1. Create the missing table

```sql
CREATE TABLE public.retailer_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid NOT NULL REFERENCES public.retailers(id) ON DELETE CASCADE,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'sent',            -- sent | queued | confirmed | rejected | failed
  twilio_sid text,
  error_message text,
  reply_text text,
  reply_received_at timestamptz,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.retailer_verification_requests (phone, sent_at DESC);
CREATE INDEX ON public.retailer_verification_requests (retailer_id, sent_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.retailer_verification_requests TO authenticated;
GRANT ALL ON public.retailer_verification_requests TO service_role;
ALTER TABLE public.retailer_verification_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON public.retailer_verification_requests FOR SELECT TO authenticated USING (true);
```

### 2. Intercept YES/NO inside the conversational WhatsApp bot

The conversational handler (the one that writes `whatsapp_sessions`) is **not present in this repo** — it must live in a separately-deployed Supabase Edge Function. I need you to point me at it:

- Name of the deployed inbound Twilio function (e.g. `whatsapp-inbound`, `whatsapp-bot`, etc.), or
- Paste the `index.ts` for it, or
- Confirm I can copy its source into this repo first.

Once available, add this block at the very top of the handler — **before** session lookup / AI call:

```ts
const fromDigits = stripWhatsApp(from).replace(/\D/g, "").slice(-10);
const { data: pending } = await supabase
  .from("retailer_verification_requests")
  .select("id, retailer_id")
  .ilike("phone", `%${fromDigits}`)
  .in("status", ["sent", "queued"])
  .gte("sent_at", new Date(Date.now() - 30*864e5).toISOString())
  .order("sent_at", { ascending: false })
  .limit(1).maybeSingle();

if (pending) {
  const isYes = /^(y|yes|haan|ha|ok|confirm|sahi)/i.test(body);
  const isNo  = /^(n|no|nahi|wrong|galat)/i.test(body);
  if (isYes || isNo) {
    // call same DB updates as whatsapp-retailer-verify-inbound (YES path or NO path)
    // ...then return twiml(...) and SKIP the AI conversation entirely
  }
}
```

The DB updates are the same ones already in `whatsapp-retailer-verify-inbound` (sets `verified=true`, `verification_method='whatsapp'`, `verified_by_name='WhatsApp'`, `whatsapp_verified=true`, `verification_score=GREATEST(80, existing)`; updates request row to `confirmed`/`rejected`; inserts audit row). Since you already locked verified retailers at 100% via `calculate_retailer_quality_score`, the score trigger will bump them to 100 automatically.

### 3. Backfill Prajwal Genral Store

Because the YES reply was lost in the bot, manually mark this one retailer as verified via WhatsApp, then let the score trigger raise it to 100:

```sql
UPDATE public.retailers SET
  verified = true,
  verification_method = 'whatsapp',
  verified_by_name = 'WhatsApp',
  verified_at = now(),
  whatsapp_verified = true,
  verification_score = 100
WHERE id = 'e688b159-2171-4c8d-8bff-969534eed3b2';

SELECT public.calculate_retailer_quality_score('e688b159-2171-4c8d-8bff-969534eed3b2');
```

## Open question

**Where is your conversational WhatsApp bot source?** Without it, I can apply steps 1 and 3, but step 2 (the actual fix that makes future YES/NO replies work) needs that file.
