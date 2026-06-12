## Lovable Implementation: Simple AddRetailer with Auto WhatsApp

### Current Issue
AddRetailer form is too complex. User wants simple flow:
1. Collect ONLY basic info (name, phone, address, category, beat, etc.)
2. Create retailer
3. Send WhatsApp message immediately
4. Show "Waiting for customer confirmation"
5. When customer replies YES in WhatsApp, backend auto-fills verification

### What to Implement

**File: src/pages/AddRetailer.tsx**

#### STEP 1: Remove Verification Sections from Form

Find and DELETE these form sections:
- "Verification Checklist" / "Address Verification" section (verification_address, verification_contact, verification_territory checkboxes)
- "Quality Score" or "Verification Status" fields
- "Manual Approval" checklist
- Any "Verification Method" dropdown
- "Verification Notes" text area

Keep only:
- Basic info: Name, Phone, Address
- Category, Priority, Retail Type
- Beat, Territory assignment
- Owner/Contact details
- Optional: GST, parent type, competitors, location tags, photos

#### STEP 2: Modify Form Submit (around line 913)

Change from:
```typescript
const payload = {
  name: retailerData.name,
  phone: retailerData.phone,
  address: retailerData.address,
  // ... other fields
  // Old: verification fields like verification_address, verification_score, etc.
};
const result = await createRetailer(payload);
```

To:
```typescript
const payload = {
  name: retailerData.name,
  phone: retailerData.phone,
  address: retailerData.address,
  // ... other existing fields ...
  
  // NEW: Add these fields
  retailer_confirmed: false,      // Not confirmed yet (waiting for WhatsApp)
  verified: false,                // Not verified yet
  verification_method: null,      // Will be set to 'whatsapp' when customer replies
  status: 'active'               // Still active for operations
};

const result = await createRetailer(payload);

if (result.success && payload.phone) {
  // NEW: Send WhatsApp immediately
  try {
    const { maybeTriggerWhatsAppVerification } = await import('@/utils/retailerVerificationTrigger');
    maybeTriggerWhatsAppVerification(result.data.id, payload.phone);
  } catch (e) {
    console.log('WhatsApp trigger queued or skipped:', e);
  }
  
  // NEW: Show waiting message instead of "created"
  toast({
    title: "Retailer Created",
    description: "WhatsApp message sent to customer. Waiting for confirmation..."
  });
  
  navigate(returnTo, { replace: true });
} else {
  // error handling...
}
```

#### STEP 3: Update Toast Messages

- ❌ Remove: "Retailer created successfully. Waiting for approval..."
- ✅ Use: "WhatsApp message sent to customer. Waiting for confirmation..."

#### STEP 4: Edit Mode

When editing existing retailer:
- Don't re-send WhatsApp if `retailer_confirmed = true` already
- Only allow editing basic fields (name, address, etc.)
- Don't change verification status

---

### Data Model Impact

When creating retailer, ensure these are set:

```javascript
{
  // Basic info (from form)
  name: string,
  phone: string,
  address: string,
  beat_id: string,
  category: string,
  
  // NEW: Verification state
  retailer_confirmed: false,      // ← Waiting for WhatsApp
  verified: false,                 // ← Not verified yet
  verification_method: null,       // ← Will be 'whatsapp' when confirmed
  verification_score: 0,           // ← Will be 80 when confirmed
  status: 'active'                // ← Still active, just unverified
}
```

### Backend Handles Everything

✅ WhatsApp webhook (whatsapp-retailer-verify-inbound) automatically:
- Receives customer YES/NO
- Updates `verified = true`, `retailer_confirmed = true`, `verification_score = 80`
- Sends thank you message
- Creates audit trail

✅ Helper function `maybeTriggerWhatsAppVerification()` already exists and works

### UI Changes Summary

**Visible Changes:**
- Form is now 50% shorter (no verification sections)
- Submit button still labeled "Save Retailer"
- Toast shows "Waiting for customer confirmation"
- Retailer appears in Retail Management marked as "Unverified - Pending WhatsApp"

**Hidden Changes:**
- No approval workflow triggered
- No manual checklist shown
- Retailer IS created immediately (usable), just marked unverified
- When customer replies YES, UI shows "Verified" with 80% score automatically

---

### Files to Modify
1. **src/pages/AddRetailer.tsx** - Remove verification sections, add WhatsApp trigger, update toasts
2. **No backend changes needed** - WhatsApp webhook already handles it all

### Files NOT to Modify
- ❌ WhatsApp webhook (already correct)
- ❌ Database schema (already has required fields)
- ❌ Verification policy (not used in simple flow)
- ❌ Retail Management page (will show status automatically)
