CREATE TABLE IF NOT EXISTS affiliates (
 id text PRIMARY KEY, business_name text NOT NULL, email text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','inactive','rejected')),
 referral_code text NOT NULL UNIQUE, access_version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS affiliate_rules (
 id text PRIMARY KEY, affiliate_id text NOT NULL REFERENCES affiliates(id),
 customer_id text, rules jsonb NOT NULL, status text NOT NULL,
 effective_at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL, reason text NOT NULL
);
CREATE INDEX IF NOT EXISTS affiliate_rules_lookup ON affiliate_rules(affiliate_id,customer_id,effective_at);
CREATE TABLE IF NOT EXISTS affiliate_leads (
 id text PRIMARY KEY, email_digest text NOT NULL UNIQUE, phone_digest text NOT NULL,
 practice_name text NOT NULL, affiliate_id text REFERENCES affiliates(id), protected_until timestamptz,
 submitted_at timestamptz NOT NULL DEFAULT now(), converted_customer_id text, converted_at timestamptz
);
CREATE INDEX IF NOT EXISTS affiliate_leads_phone ON affiliate_leads(phone_digest);
CREATE TABLE IF NOT EXISTS affiliate_attributions (
 id text PRIMARY KEY, customer_id text NOT NULL REFERENCES customers(id),
 affiliate_id text REFERENCES affiliates(id), lead_id text REFERENCES affiliate_leads(id),
 effective_at timestamptz NOT NULL DEFAULT now(), converted_at timestamptz,
 actor text NOT NULL, reason text NOT NULL
);
CREATE INDEX IF NOT EXISTS affiliate_attributions_lookup ON affiliate_attributions(customer_id,effective_at);
CREATE TABLE IF NOT EXISTS affiliate_customer_states (
 id text PRIMARY KEY, customer_id text NOT NULL, eligible boolean NOT NULL,
 effective_at timestamptz NOT NULL, source_key text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS affiliate_challenges (
 id text PRIMARY KEY, affiliate_id text NOT NULL REFERENCES affiliates(id),
 email text NOT NULL, access_version integer NOT NULL, expires_at timestamptz NOT NULL,
 consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS affiliate_sessions (
 id text PRIMARY KEY, affiliate_id text NOT NULL REFERENCES affiliates(id), access_version integer NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, last_seen_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS affiliate_activity (
 id text PRIMARY KEY, affiliate_id text REFERENCES affiliates(id), action text NOT NULL,
 actor text NOT NULL, customer_id text, reason text, details jsonb NOT NULL DEFAULT '{}',
 session_id text, ip inet, country text, region text, telemetry boolean NOT NULL DEFAULT false,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_activity_lookup ON affiliate_activity(affiliate_id,occurred_at);
CREATE TABLE IF NOT EXISTS affiliate_ledger (
 id text PRIMARY KEY, affiliate_id text NOT NULL REFERENCES affiliates(id), customer_id text,
 source_key text NOT NULL UNIQUE, source_history_id text, charge_key text,
 kind text NOT NULL CHECK (kind IN ('earning','clawback','recovery','adjustment')),
 cents integer NOT NULL, collected_cents integer NOT NULL DEFAULT 0,
 rule jsonb, earning_id text REFERENCES affiliate_ledger(id), reason text,
 occurred_at timestamptz NOT NULL, period text NOT NULL CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_earning_charge ON affiliate_ledger(charge_key) WHERE kind='earning';
CREATE INDEX IF NOT EXISTS affiliate_ledger_lookup ON affiliate_ledger(affiliate_id,period);
CREATE TABLE IF NOT EXISTS affiliate_reversals (
 charge_key text PRIMARY KEY, customer_id text NOT NULL, refund_cents integer NOT NULL DEFAULT 0,
 dispute_cents integer NOT NULL DEFAULT 0, dispute_at timestamptz, refund_at timestamptz,
 applied_cents integer NOT NULL DEFAULT 0, revision integer NOT NULL DEFAULT 0,
 ineligible boolean NOT NULL DEFAULT false, eligibility_at timestamptz
);
CREATE TABLE IF NOT EXISTS affiliate_history_work (
 history_id text PRIMARY KEY, completed_at timestamptz, error text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS affiliate_disputes (
 id text PRIMARY KEY, charge_key text NOT NULL, amount_cents integer NOT NULL,
 status text NOT NULL, occurred_at timestamptz NOT NULL, updated_event_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS affiliate_payouts (
 id text PRIMARY KEY, affiliate_id text NOT NULL REFERENCES affiliates(id),
 period text NOT NULL CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
 amount_cents integer NOT NULL CHECK(amount_cents>0), payment_date date NOT NULL,
 reference text NOT NULL, request_key text NOT NULL UNIQUE, actor text NOT NULL,
 notification_status text NOT NULL DEFAULT 'pending', notification_error text,
 notification_sent_at timestamptz, notification_started_at timestamptz,
 notification_recipient text NOT NULL, notification_business_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS affiliate_payout_allocations (
 payout_id text NOT NULL REFERENCES affiliate_payouts(id),
 earning_id text NOT NULL REFERENCES affiliate_ledger(id), cents integer NOT NULL CHECK(cents>0),
 PRIMARY KEY(payout_id,earning_id)
);
CREATE OR REPLACE FUNCTION affiliate_immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Affiliate financial history is immutable; use an explicit adjustment'; END $$;
DROP TRIGGER IF EXISTS affiliate_ledger_immutable ON affiliate_ledger;
CREATE TRIGGER affiliate_ledger_immutable BEFORE UPDATE OR DELETE ON affiliate_ledger FOR EACH ROW EXECUTE FUNCTION affiliate_immutable_record();
DROP TRIGGER IF EXISTS affiliate_payout_financial_immutable ON affiliate_payouts;
CREATE OR REPLACE FUNCTION affiliate_payout_guard() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 IF (NEW.id,NEW.affiliate_id,NEW.period,NEW.amount_cents,NEW.payment_date,NEW.reference,NEW.request_key,NEW.actor,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.affiliate_id,OLD.period,OLD.amount_cents,OLD.payment_date,OLD.reference,OLD.request_key,OLD.actor,OLD.created_at)
 THEN RAISE EXCEPTION 'Wire history is immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER affiliate_payout_financial_immutable BEFORE UPDATE ON affiliate_payouts FOR EACH ROW EXECUTE FUNCTION affiliate_payout_guard();
DROP TRIGGER IF EXISTS affiliate_payout_delete_immutable ON affiliate_payouts;
CREATE TRIGGER affiliate_payout_delete_immutable BEFORE DELETE ON affiliate_payouts FOR EACH ROW EXECUTE FUNCTION affiliate_immutable_record();
DROP TRIGGER IF EXISTS affiliate_allocations_immutable ON affiliate_payout_allocations;
CREATE TRIGGER affiliate_allocations_immutable BEFORE UPDATE OR DELETE ON affiliate_payout_allocations FOR EACH ROW EXECUTE FUNCTION affiliate_immutable_record();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['affiliates','affiliate_rules','affiliate_leads','affiliate_attributions','affiliate_customer_states',
 'affiliate_challenges','affiliate_sessions','affiliate_activity','affiliate_ledger','affiliate_reversals',
 'affiliate_disputes','affiliate_payouts','affiliate_payout_allocations','affiliate_history_work']
 LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated',t); END LOOP;
END $$;
-- Custom SQL migration file, put your code below! --