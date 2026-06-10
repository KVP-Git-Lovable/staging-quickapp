## Plan

I’ll change the approval checklist so DB data is treated as evidence only, not as already verified.

### What will change

1. **All checklist boxes start unchecked**
   - Shop Name, Phone, Address, GPS, WhatsApp, Photo, GST will all start unchecked every time the dialog opens.
   - No field will be locked just because data exists in the database.

2. **Approver must manually tick each box**
   - Clicking a card or checkbox will check/uncheck it.
   - The verification score will increase only from manually selected boxes.
   - Partial verification will work naturally: tick only the items you personally verified.

3. **Keep DB data visible as evidence**
   - The name, phone, address, GPS, WhatsApp status, photo, and GST values will still show on the card.
   - Supporting lines will say things like “Data present” / “Missing” instead of implying “Auto-verified”.

4. **Approval gate remains risk-based**
   - To approve as verified, the manually checked score must reach the core 80%: Name + Phone + Address + GPS.
   - If only some boxes are checked, the retailer remains partially verified / unverified based on score.

5. **Update labels and saved audit data**
   - Remove “Auto-verified · locked”.
   - Show “Manually verified by you” only after the approver ticks a box.
   - Save the final score and checked items based on manual confirmation, not DB presence.

### Technical details

- Update `src/components/retailer/ApprovalChecklistDialog.tsx` only.
- Change `signals` calculation from `auto || manual` to manual-only scoring.
- Keep `auto` only for evidence display and warnings.
- Remove the FieldCard locked/disabled behavior.
- Update missing/approval copy so it says manual verification is required for core fields.