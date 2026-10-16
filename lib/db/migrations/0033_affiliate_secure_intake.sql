-- Additive secure intake; existing partners receive no invitation backfill.
CREATE TABLE affiliate_onboarding (
  affiliate_id text PRIMARY KEY REFERENCES affiliates(id),
  version integer NOT NULL DEFAULT 0,
  contact_cipher text NOT NULL,
  wire_cipher text NOT NULL,
  w9_cipher text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text
);
ALTER TABLE affiliate_onboarding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON affiliate_onboarding FROM PUBLIC, anon, authenticated;
CREATE TABLE affiliate_onboarding_invitations (
  id text PRIMARY KEY,
  affiliate_id text NOT NULL REFERENCES affiliates(id),
  initial boolean NOT NULL DEFAULT false,
  recipient text NOT NULL,
  business_name text NOT NULL,
  access_version integer NOT NULL,
  entry_id text NOT NULL,
  delivery_snapshot jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','failed','cancelled','uncertain')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  first_attempt_at timestamptz,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_id text,
  log_id text
);
CREATE UNIQUE INDEX affiliate_onboarding_initial ON affiliate_onboarding_invitations(affiliate_id) WHERE initial;
CREATE INDEX affiliate_onboarding_delivery ON affiliate_onboarding_invitations(next_attempt_at) WHERE status IN ('pending','sending','failed');
ALTER TABLE affiliate_onboarding_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON affiliate_onboarding_invitations FROM PUBLIC, anon, authenticated;