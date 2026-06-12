# Retailer Verification Flow — Complete Audit Report

## ERROR IN PRODUCTION
**Sync Progress error:** `Unknown: record "r" has no field "verification_status"`

This error occurs when syncing new retailers (Shravya general store, Suoyg General store) because code is trying to set a column that doesn't exist.

---

## ROOT CAUSE: Lovable added code using non-existent column

The retailers table schema has these verification columns:
✅ `verified` (boolean)
✅ `verification_method` (text)
✅ `verification_score` (integer, 0-100)
✅ `verified_by` (uuid)
✅ `verified_by_name` (text)
✅ `whatsapp_verified` (boolean)
✅ `verification_address`, `verification_contact`, `verification_territory` (booleans)

❌ `verification_status` — DOES NOT EXIST

---

## 3 FILES WITH BROKEN CODE

### File 1: `src/components/retailer/ApprovalChecklistDialog.tsx`

**Lines 221, 231, 234, 237** — Trying to set non-existent column:

```typescript
patch.verification_status = "verified";        // ❌ Column doesn't exist
patch.verification_status = "needs_attention"; // ❌ Column doesn't exist
patch.verification_status = "dropped";         // ❌ Column doesn't exist
```

**Impact:** Approval dialog save fails. Users can't complete checklist verification.

---

### File 2: `src/pages/RetailManagement.tsx`

**15 different places** using `verification_status`:

```typescript
Line 257:  let verificationStatus = r.verification_status || 'pending';           // ❌
Line 281:  verification_status: verificationStatus,                              // ❌
Line 327:  verification_status: newStatus,                                       // ❌
Line 457:  const matchesVerified = verifiedFilter === 'all' || r.verification_status === verifiedFilter; // ❌
Line 494:  case 'verified': matchesKpi = r.verification_status === 'verified';  // ❌
Line 495:  case 'unverified': matchesKpi = r.verification_status === 'pending';  // ❌
Line 496:  case 'needs_attention': matchesKpi = r.verification_status === 'needs_attention'; // ❌
Line 497:  case 'dropped': matchesKpi = r.verification_status === 'dropped';    // ❌
Line 534:  verified: retailers.filter(r => r.verification_status === 'verified').length,  // ❌
Line 535:  unverified: retailers.filter(r => r.verification_status === 'pending').length,  // ❌
```

**Impact:** 
- Filtering by verification status doesn't work
- KPI cards show 0 for verified/unverified
- Quality Score badge doesn't display correctly
- Verification status column doesn't populate

---

### File 3: `src/pages/AddRetailer.tsx`

**Issue:** No WhatsApp verification sent after adding retailer

Currently:
- Add retailer → saved to DB
- No WhatsApp message sent
- No auto-fill of verification columns
- User must manually go to RetailManagement → WhatsApp verify

**Should be:**
- Add retailer → send WhatsApp verification → auto-fill when customer confirms
- Offline: queue verification, send when online

---

## MISSING FEATURES

### Feature 1: Auto-send WhatsApp after AddRetailer
**Missing in:** `src/pages/AddRetailer.tsx`

When retailer is successfully added, should:
1. Call `send-retailer-verification-whatsapp` edge function
2. Send verification message to customer
3. Wait for WhatsApp response via `whatsapp-retailer-verify-inbound` webhook

---

### Feature 2: Auto-fill verification on WhatsApp "Yes"
**Missing in:** Webhook handler `supabase/functions/whatsapp-retailer-verify-inbound`

When customer clicks "Yes" in WhatsApp, should:
1. Set `whatsapp_verified = true`
2. Set `verified = true`
3. Set `verification_score = 80` (basic info only)
4. Set `verification_method = 'whatsapp'`
5. Set `verified_by = system` (or trigger user who added it)
6. Set `verified_by_name = 'Customer (WhatsApp)'`
7. Set `verified_at = now()`
8. Set `retailer_confirmed = true`

Then send thank you message (already configured in Twilio).

---

### Feature 3: Allow editing partially verified retailers (< 100%)
**Missing in:** `src/components/retailer/ApprovalChecklistDialog.tsx`

When `verification_score < 100`:
- Show "Continue verification" button instead of locked state
- Allow opening checklist for remaining items
- Calculate new score based on checked items
- Update `verification_score` incrementally

---

### Feature 4: Offline queue for verification messages
**Missing in:** `src/hooks/useOfflineSync.ts`

Currently:
- Retailers added offline don't queue verification
- When user goes online, no verification is sent

Should be:
- Offline AddRetailer → queue retailer + `{action: 'send_verification'}`
- When online → send queued verifications
- Track state: pending → sent → confirmed → verified

---

## WHATSAPP VERIFY FROM RETAIL MANAGEMENT (Image 3)

**Function:** `sendWhatsAppVerification()` in `src/pages/RetailManagement.tsx` (line 572)

**Current behavior:** ✅ Works correctly
- Calls `send-retailer-verification-whatsapp` with `retailer_id`
- Shows "Sending..." toast
- Sends verification message

**Issue:** This is SEPARATE from AddRetailer flow
- Two different code paths for same action
- Should be consolidated

---

## SUMMARY TABLE

| Issue | File | Lines | Status | Impact |
|-------|------|-------|--------|--------|
| Sets non-existent `verification_status` | ApprovalChecklistDialog.tsx | 221, 231, 234, 237 | ❌ BROKEN | Approval fails |
| Uses non-existent `verification_status` | RetailManagement.tsx | 15 locations | ❌ BROKEN | Filtering/KPIs broken |
| No WhatsApp sent after AddRetailer | AddRetailer.tsx | ~1450+ | ❌ MISSING | No auto-verification |
| No auto-fill on WhatsApp confirm | whatsapp-retailer-verify-inbound | N/A | ❌ MISSING | Manual process |
| Can't edit partial verification | ApprovalChecklistDialog.tsx | All | ❌ MISSING | Can't complete verification |
| Offline doesn't queue verification | useOfflineSync.ts | All | ❌ MISSING | Offline users lose verification |
| Two separate WhatsApp flows | AddRetailer vs RetailManagement | Both | ⚠️ DUPLICATE | Code duplication |

---

## WHAT NEEDS TO HAPPEN

### Step 1: Fix the immediate error
Remove all `verification_status` assignments and usages.
Replace logic to use existing columns:
- `verified` (boolean)
- `verification_score` (0-100)
- `verification_method` ('whatsapp', 'manual', etc.)

### Step 2: Implement AddRetailer → WhatsApp flow
After successful retailer insert in AddRetailer:
```typescript
// Send WhatsApp verification
await supabase.functions.invoke('send-retailer-verification-whatsapp', {
  body: { retailer_id: newRetailerId }
});
```

### Step 3: Implement WhatsApp webhook handler
When customer clicks "Yes":
```typescript
UPDATE retailers SET
  verified = true,
  verification_score = 80,
  verification_method = 'whatsapp',
  verified_by = (system or original user),
  verified_by_name = 'Customer (WhatsApp)',
  whatsapp_verified = true,
  verified_at = now(),
  retailer_confirmed = true
WHERE id = retailer_id
```

### Step 4: Allow partial verification editing
Show "Continue verification" for `verification_score < 100`:
- Open checklist
- Auto-calculate score from checked items
- Update in real-time

### Step 5: Implement offline verification queuing
Store in offline bucket when adding retailer:
```typescript
{
  retailer_id,
  action: 'send_verification',
  status: 'pending',
  retry_count: 0
}
```

When online, sync and send.

---

## CURRENT STATE vs REQUIRED STATE

### Current (Broken)
```
Add Retailer
├─ Save to DB ✓
├─ Try to set verification_status ❌ ERROR
├─ User manually goes to RetailManagement
└─ Clicks WhatsApp verify
   ├─ Send WhatsApp ✓
   ├─ Customer replies YES
   ├─ Webhook receives (should auto-fill) ❌ MISSING
   └─ User must manually approve in checklist
```

### Required (User's requirement)
```
Add Retailer
├─ Save to DB ✓
├─ Auto-send WhatsApp verification ← ADD
├─ Customer replies YES
├─ Auto-fill: Quality Score=80%, Verification=Verified, Verified By=Customer(WhatsApp) ← ADD
├─ Show "Continue verification" button ← ADD
└─ User can open checklist to verify remaining 20% ← ADD

Or from RetailManagement > WhatsApp verify
├─ Same WhatsApp flow (consolidated code) ← ADD
└─ Same auto-fill behavior ← ADD

Offline:
├─ Queue verification message ← ADD
├─ When online: send queued verifications ← ADD
└─ Mark as verified when confirmed ← ADD
```

---

## CONCLUSION

The entire verification flow needs to be rebuilt. Lovable introduced references to a non-existent column which broke everything. The proper flow requires:

1. **Immediate fix:** Remove `verification_status` usage (4 locations)
2. **New code:** Auto-send WhatsApp after AddRetailer (1 location)
3. **New code:** Handle WhatsApp webhook response with auto-fill (1 webhook)
4. **New code:** Allow partial verification editing (2 locations)
5. **New code:** Offline queue for verifications (2 locations)
6. **Refactor:** Consolidate AddRetailer and RetailManagement WhatsApp flows
