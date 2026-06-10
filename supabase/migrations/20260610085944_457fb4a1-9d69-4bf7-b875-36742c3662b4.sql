
-- Extend retailer_verification_policy with full governance configuration
ALTER TABLE public.retailer_verification_policy
  ADD COLUMN IF NOT EXISTS req_mobile boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS req_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS req_gps boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS req_shop_photo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS req_owner_name boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS req_gst boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS req_first_visit boolean NOT NULL DEFAULT false,
  -- Score engine points
  ADD COLUMN IF NOT EXISTS pts_mobile integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS pts_whatsapp integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS pts_gps integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS pts_shop_photo integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS pts_address integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS pts_gst integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS pts_owner integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS pts_first_visit integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS pts_first_order integer NOT NULL DEFAULT 10,
  -- Status thresholds
  ADD COLUMN IF NOT EXISTS threshold_partial integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS threshold_verified integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS threshold_gold integer NOT NULL DEFAULT 90,
  -- Duplicate detection
  ADD COLUMN IF NOT EXISTS dup_check_mobile boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dup_check_gst boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dup_check_name boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dup_check_address boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dup_check_gps boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dup_action text NOT NULL DEFAULT 'require_approval',
  ADD COLUMN IF NOT EXISTS dup_risk_threshold integer NOT NULL DEFAULT 70,
  -- Approval workflow
  ADD COLUMN IF NOT EXISTS approval_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_level text NOT NULL DEFAULT 'manager',
  ADD COLUMN IF NOT EXISTS auto_approve_score integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS auto_reject_dup_risk integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS expire_pending_days integer NOT NULL DEFAULT 30,
  -- Gamification points
  ADD COLUMN IF NOT EXISTS gp_created integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS gp_mobile integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS gp_whatsapp integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS gp_gps integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS gp_photo integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS gp_first_visit integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS gp_first_order integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS gp_revoke_on_fraud boolean NOT NULL DEFAULT true;
