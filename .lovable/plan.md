## Finding

The WhatsApp verify click is failing before the message is sent because the deployed Supabase project returns `404 Requested function was not found` for `send-retailer-verification-whatsapp`. That means the frontend is calling the correct function name, but the Edge Function is not currently deployed/available in Supabase.

I also found the function code still hardcodes Twilio Account SID and WhatsApp sender number instead of using the configured secrets already present in the project: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_WHATSAPP_NUMBER`.

## Plan

1. Update `send-retailer-verification-whatsapp` to read Twilio settings from environment secrets:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_NUMBER`

2. Keep the existing frontend call unchanged because it is already calling:
   - `send-retailer-verification-whatsapp`
   - with `{ retailer_id }`

3. Improve the Edge Function error response so the UI shows a useful reason if Twilio rejects the send, for example invalid sender, invalid destination, or missing secret.

4. Deploy `send-retailer-verification-whatsapp` to Supabase so the button no longer receives `Function not found`.

5. Test the deployed function against the current retailer flow and confirm:
   - the Edge Function responds successfully
   - a row is created in `retailer_verification_requests`
   - Twilio returns a message SID
   - the UI no longer shows “Failed to send a request to the Edge Function”