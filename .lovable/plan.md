## Goal

Add a Help ("Madad") call button next to the existing Copilot sparkle icon in the top navbar. Tapping it triggers the Bolna agent `af3cbfa9-7913-48ff-b6c1-d80e24b2bd4b` to place an outbound voice call to the signed-in user's own phone number.

## Icon

- Placed immediately to the left of the Copilot sparkles icon in `src/components/Navbar.tsx`.
- Circular yellow badge with a headset/support-person glyph and a small question-mark accent (lucide `Headset` + `HelpCircle` overlay), sized to match the neighbouring icons.
- States: idle → tap → spinner while the call is being placed → toast "Madad is calling you now on +91XXXXXXXXXX" or an error toast. Button disabled while a request is in flight.
- If the user's profile has no phone number, the toast explains that and links to `/profile`.

## Backend

New edge function `supabase/functions/madad-help-call/index.ts` (registered in `supabase/config.toml` with `verify_jwt = true`):

- Reads the caller's JWT, resolves `auth.uid()`, and loads `profiles.phone_number` for that user with the service-role client. The phone is never taken from the request body, so a user can only trigger a call to their own number.
- Normalises the number with the same `normalisePhone` logic used by `bolna-outbound-call` (10 digits → `+91…`).
- POSTs to `https://api.bolna.ai/call` with `agent_id` from a new `BOLNA_HELP_AGENT_ID` secret (defaulting to the ID given), `recipient_phone_number`, the same `from_phone_number`, and `user_data` carrying the user's id, name and role so the Madad agent can personalise the conversation.
- Returns `{ success, call_id }` or a friendly `{ success: false, error }`; existing `bolna-outbound-call` is left untouched.

## Frontend

- Small hook/handler in the navbar that invokes the function via `supabase.functions.invoke("madad-help-call")` and surfaces the result through the existing toast system.
- No routing, layout, or other navbar behaviour changed.

## Secrets

Adds `BOLNA_HELP_AGENT_ID` (value `af3cbfa9-7913-48ff-b6c1-d80e24b2bd4b`). `BOLNA_API_KEY` is already configured and reused.
