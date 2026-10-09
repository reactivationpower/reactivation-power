-- Distinguish proven, unique Stripe cash withdrawals from overlapping face-value disputes.
ALTER TABLE affiliate_disputes ADD COLUMN IF NOT EXISTS cash_loss boolean NOT NULL DEFAULT false;
ALTER TABLE affiliate_reversals ADD COLUMN IF NOT EXISTS proven_dispute_cents integer NOT NULL DEFAULT 0;