# How to Increase Retailer Verification Score to 100%

## Understanding Verification Scores

### Current Score Breakdown (Example: 42% → 100%)

When you open a retailer's Risk Assessment dialog, you'll see:

```
VERIFICATION SCORE: 42%
Current: 42% (verified via system). Tick boxes to increase further.
```

### How Verification Points Work

Each checklist item adds points toward a 100% score:

| Item | Points | Category |
|------|--------|----------|
| **Shop Name** | 20% | Core (must have) |
| **Phone** | 25% | Core (must have) |
| **Address** | 15% | Core (must have) |
| **GPS Location** | 20% | Core (must have) |
| **WhatsApp** | 10% | Optional |
| **Shop Photo** | 5% | Optional |
| **GST Number** | 5% | Optional |

**Core 80% Requirement:** Shop Name + Phone + Address + GPS = 80% minimum  
**Remaining 20%:** WhatsApp (10%) + Photo (5%) + GST (5%)

---

## Step-by-Step: Reach 100% Verification

### Example: Shravya General Store (Currently 42%)

**Status Now:** VERIFICATION SCORE: 42% (Partially Verified)

**What's Missing:**
- ❌ Shop Name: Not verified
- ❌ Phone: Not verified  
- ❌ Address: Not verified
- ❌ GPS: Not verified
- ❌ WhatsApp: Pending
- ❌ Shop Photo: No
- ❌ GST: No

### How to Increase Score

1. **Open Retailer Risk Assessment**
   - Go to My Retailers or Retail Management
   - Click on "Shravya General Store"
   - Dialog opens showing "VERIFICATION SCORE: 42%"

2. **Check Each Verification Item**

   **For Core 80% (Must Have):**
   
   - [ ] **SHOP NAME** (20%)
     - Verify shop name is correct and visible on board/sign
     - Check: "Name provided" ✓
     - Check: "No exact duplicate" ✓
     - **Score becomes: 42% → 62%**
   
   - [ ] **PHONE** (25%)
     - Verify phone number is valid and in use
     - Check: "10+ digits" ✓
     - Check: "WhatsApp verified" (optional) ✓
     - Check: "Not used elsewhere" (optional) ✓
     - **Score becomes: 62% → 87%**
   
   - [ ] **ADDRESS** (15%)
     - Verify address matches shop location
     - Click checkbox
     - **Score becomes: 87% → 100%**
   
   - [ ] **GPS** (20%)
     - GPS already captured from map
     - Auto-verified
     - Click checkbox
     - **Score becomes: 100% (already at 100% if all above are done)**

   **For Optional 20% (Extra Points):**
   
   - [ ] **WhatsApp** (10%)
     - Customer confirmed via WhatsApp YES/NO
     - Auto-verified
     - **+10%**
   
   - [ ] **Shop Photo** (5%)
     - Photo of shop front provided
     - **+5%**
   
   - [ ] **GST Number** (5%)
     - Valid 10+ digit GST number
     - **+5%**

3. **Save and Approve**
   - After checking all boxes for core 80%
   - Click "Approve" button
   - Score updates to 80%-100% depending on what you checked

---

## Verification Statuses

| Score | Status | Meaning |
|-------|--------|---------|
| 0-49% | **Unverified** | ❌ Not enough core info |
| 50-79% | **Partially Verified** | ⚠️ Some core info missing |
| 80-89% | **Verified** | ✓ Core 80% complete |
| 90-100% | **Gold Verified** | ★ Fully verified |

---

## Key Points to Remember

✅ **Core 80% is mandatory** for a retailer to be considered "Verified"
- Requires: Name + Phone + Address + GPS

✅ **Score auto-calculated** from which boxes you check
- As you tick boxes, score updates live (0%, 5%, 10%... 100%)

✅ **WhatsApp verified status** auto-filled
- When customer replies YES to WhatsApp message, WhatsApp box is pre-checked

✅ **Save approval** locks in the score
- Once approved, retailer gets that verification score badge

✅ **You can increase later**
- If verified at 80%, you can re-open and add Shop Photo (+5%) to get 85%
- Then add GST Number (+5%) to reach 90%

---

## Example Workflow

```
1. Retailer created → 0% (no verification yet)
   ↓
2. WhatsApp sent to customer
   ↓
3. Customer replies YES → 80% (WhatsApp verification)
   (verification_score auto-set to 80 by webhook)
   ↓
4. You open Risk Assessment → See "Current: 80%"
   ↓
5. Check "Shop Name" (+20%)? 
   ✓ If yes → shows path to 100%
   ✗ If no → stay at 80%
   ↓
6. Check remaining boxes as needed:
   - Shop Name: +20% → 80% → 100%
   - Or: WhatsApp (+10%) + Photo (+5%) + GST (+5%) → 80% → 100%
   ↓
7. Click "Approve" → Locks in final score
   ↓
8. Retailer now "Gold Verified" or "Verified"
```

---

## Troubleshooting

**Q: Score shows 0% but should be 80%?**  
A: Dialog now fetches latest data from DB when opened. If still showing 0%, the verification_score wasn't saved to DB properly. Check RetailManagement list - if it shows correct score there, close and reopen dialog.

**Q: Can I edit already-checked boxes?**  
A: Yes! Uncheck any box and the score decreases. You can always modify verification status.

**Q: What if customer says NO to WhatsApp?**  
A: WhatsApp box stays unchecked. You must manually verify core items (name, phone, address, GPS) to reach 80%.

**Q: Score stuck at 42%?**  
A: This means only partial core info is available. Check which items are missing and verify them in the checklist.
