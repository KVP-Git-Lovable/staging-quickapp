## Root cause

The Approve dialog writes `verification_score = 80` to the retailer, but a database trigger `retailers_score_recalc` fires after the UPDATE and calls `calculate_retailer_quality_score()`, which recomputes the score from raw column data (name, phone, GST, photo, etc.) and overwrites the 80 with whatever the formula yields — in this row's case, 52.

Side effect: the same trigger also wipes out the `80` we set on WhatsApp YES confirmation in `whatsapp-retailer-verify-inbound`, so that fix from earlier is also being silently undone.

## Fix

Update the `calculate_retailer_quality_score` PostgreSQL function so a verified retailer is never demoted below the verified threshold. After computing `score`, apply a floor based on verification state:

```text
if verified = true AND verification_status = 'verified':
    score = GREATEST(score, 80)        -- manual approve OR WhatsApp YES
elsif whatsapp_verified = true:
    score = GREATEST(score, 80)        -- WhatsApp self-confirm
```

Then recompute `quality_status` from the final (floored) score using the existing thresholds (gold ≥90, verified ≥70, partial ≥40).

This is a single migration that replaces the function body. The trigger and all call sites stay the same. No frontend changes are needed — the dialog already writes the correct fields (`verified=true`, `verification_status='verified'`, `verification_method='manual'`), and the WhatsApp inbound webhook already sets `verified=true` + `verification_status='verified'`.

## Verification

1. Open the Kuvempunagar retailer in Retail Management, run Approve again → Quality Score should display 80% (or higher if the raw signals already produce more), badge "Verified".
2. Send a WhatsApp verify to a test retailer and reply "YES" → row should show ≥80% and blue tick.
3. Reply "NO" on a different test retailer → `verification_status = needs_attention`, score returns to raw computed value (no floor), no blue tick.
