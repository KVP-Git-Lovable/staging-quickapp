# Multi-select Payment Modes (Distributor Master → Primary Order)

## Goal
In the distributor master's **Payment Configuration**, replace the single "Default Payment Mode" dropdown with:
1. **Allowed Payment Modes** — multi-select (Credit, Bank Transfer, UPI, Cash, Cheque, NEFT/RTGS).
2. **Default Payment Mode** — single dropdown limited to the chosen allowed modes (used as the pre-selected value).

Then in **Create Primary Order**, show a Payment Mode dropdown that lists only the allowed modes for that distributor, defaulted to the master's default.

## Changes

### 1. Database (`distributor_payment_config`)
- Add column `allowed_payment_modes text[] NOT NULL DEFAULT ARRAY['bank_transfer']`.
- Backfill: for existing rows, set `allowed_payment_modes = ARRAY[default_payment_mode]`.
- Keep `default_payment_mode` column as-is (still the single default).
- Add a CHECK trigger (not constraint) ensuring `default_payment_mode = ANY(allowed_payment_modes)` and `array_length(allowed_payment_modes,1) >= 1`.

### 2. `src/components/distributor/PaymentCreditTab.tsx`
- Extend `ConfigRow` with `allowed_payment_modes: PaymentMode[]`.
- Replace the single "Default Payment Mode" Select with:
  - **Allowed Payment Modes** — checkbox group / multi-select using the 6 `MODE_LABELS`.
  - **Default Payment Mode** — Select filtered to the chosen allowed modes; auto-reset if current default gets unchecked.
- Persist both fields on save. Validate at least one mode is selected.

### 3. `src/pages/distributor-portal/CreatePrimaryOrder.tsx`
- When loading `paymentConfig`, also read `allowed_payment_modes`.
- In the Payment card (currently only seeds `paymentMode` silently), add a **Payment Mode** `<Select>` whose `SelectItem`s are restricted to `allowed_payment_modes`, defaulted to `default_payment_mode`.
- Existing `payment.paymentMode` state and submit (`payment_mode: payment.paymentMode`) stay the same.

## Out of scope
- Per-retailer payment mode overrides.
- Any change to actual payment recording flow (`CollectPayment.tsx`) — that remains its full set of modes.

## Files touched
- New migration (adds `allowed_payment_modes` column + backfill + trigger + GRANTs already exist on the table).
- `src/components/distributor/PaymentCreditTab.tsx`
- `src/pages/distributor-portal/CreatePrimaryOrder.tsx`
