-- Additive only. No historical attribution or financial backfill.
CREATE TABLE reseller_companies (
  id text PRIMARY KEY, business_name text NOT NULL, email text NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(), terminated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reseller_members (
  user_id text PRIMARY KEY, company_id text NOT NULL REFERENCES reseller_companies(id),
  role text NOT NULL CHECK(role IN ('reseller_manager','reseller_salesperson')),
  name text NOT NULL, email text NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reseller_members_company_idx ON reseller_members(company_id);
CREATE TABLE reseller_prices (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  lifetime_cents integer NOT NULL CHECK(lifetime_cents>=50 AND lifetime_cents<=99999999),
  monthly_cents integer NOT NULL CHECK(monthly_cents>=50 AND monthly_cents<=99999999),
  setup_cents integer NOT NULL CHECK(setup_cents=0 OR setup_cents BETWEEN 50 AND 99999999),
  version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reseller_prospects (
  id text PRIMARY KEY, company_id text NOT NULL REFERENCES reseller_companies(id),
  salesperson_id text NOT NULL REFERENCES reseller_members(user_id),
  full_name text NOT NULL, business_name text NOT NULL, email text NOT NULL,
  phone text NOT NULL, business_address text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'New' CHECK(stage IN ('New','Contacted','Demo','Offer','Customer','Do Not Contact','Lost')),
  consent_evidence text NOT NULL DEFAULT '', do_not_contact boolean NOT NULL DEFAULT false,
  next_followup_at timestamptz, customer_id text REFERENCES customers(id),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reseller_prospects_scope_idx ON reseller_prospects(company_id,salesperson_id);
CREATE TABLE reseller_activity (
  id text PRIMARY KEY, company_id text REFERENCES reseller_companies(id),
  prospect_id text REFERENCES reseller_prospects(id), actor text NOT NULL,
  action text NOT NULL, reason text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
-- Frozen at quote creation; memberships/assignment changes never rewrite attribution.
CREATE TABLE reseller_sales (
  link_id text PRIMARY KEY REFERENCES payment_link_terms(link_id),
  company_id text NOT NULL REFERENCES reseller_companies(id),
  salesperson_id text NOT NULL REFERENCES reseller_members(user_id),
  prospect_id text NOT NULL REFERENCES reseller_prospects(id),
  customer_id text NOT NULL REFERENCES customers(id),
  price_version integer NOT NULL, standard_lifetime_cents integer NOT NULL,
  standard_monthly_cents integer NOT NULL, standard_setup_cents integer NOT NULL,
  quoted_lifetime_cents integer NOT NULL, quoted_monthly_cents integer NOT NULL,
  quoted_setup_cents integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reseller_sales_customer_idx ON reseller_sales(customer_id);
CREATE TABLE reseller_ledger (
  id text PRIMARY KEY, company_id text NOT NULL REFERENCES reseller_companies(id),
  customer_id text REFERENCES customers(id), link_id text,
  source_key text NOT NULL UNIQUE, source_history_id text REFERENCES payment_history(id),
  charge_key text, kind text NOT NULL CHECK(kind IN ('earning','clawback','recovery','correction')),
  cents integer NOT NULL, collected_cents integer NOT NULL DEFAULT 0, source_total_cents integer NOT NULL DEFAULT 0,
  earning_id text REFERENCES reseller_ledger(id), rate_bps integer NOT NULL DEFAULT 2000 CHECK(rate_bps=2000),
  reason text NOT NULL, occurred_at timestamptz NOT NULL, period text NOT NULL CHECK(period ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
CREATE INDEX reseller_ledger_company_idx ON reseller_ledger(company_id,period);
CREATE UNIQUE INDEX reseller_ledger_charge_idx ON reseller_ledger(charge_key) WHERE kind='earning';
CREATE TABLE reseller_reversals (
  charge_key text PRIMARY KEY, refund_cents integer NOT NULL DEFAULT 0,
  dispute_cents integer NOT NULL DEFAULT 0, proven_dispute_cents integer NOT NULL DEFAULT 0,
  applied_cents integer NOT NULL DEFAULT 0, revision integer NOT NULL DEFAULT 0,
  occurred_at timestamptz NOT NULL
);
CREATE TABLE reseller_subscription_states (
  source_key text PRIMARY KEY, link_id text NOT NULL, eligible boolean NOT NULL,
  effective_at timestamptz NOT NULL
);
CREATE TABLE reseller_history_work (
  history_id text PRIMARY KEY REFERENCES payment_history(id), completed_at timestamptz,
  error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reseller_disputes (
  id text PRIMARY KEY, charge_key text NOT NULL, amount_cents integer NOT NULL,
  cash_loss boolean NOT NULL, status text NOT NULL, updated_event_at timestamptz NOT NULL
);
CREATE TABLE reseller_onboarding (
  company_id text PRIMARY KEY REFERENCES reseller_companies(id), version integer NOT NULL DEFAULT 1,
  contact_cipher text NOT NULL, wire_cipher text NOT NULL, w9_cipher text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewed_by text
);
CREATE TABLE reseller_payouts (
  id text PRIMARY KEY, company_id text NOT NULL REFERENCES reseller_companies(id),
  period text NOT NULL, amount_cents integer NOT NULL CHECK(amount_cents>0),
  payment_date date NOT NULL, reference text NOT NULL, request_key text NOT NULL UNIQUE,
  actor text NOT NULL, notification_status text NOT NULL DEFAULT 'pending',
  notification_recipient text NOT NULL, notification_business_name text NOT NULL,
  provider_id text, notification_error text, lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reseller_payout_allocations (
  payout_id text NOT NULL REFERENCES reseller_payouts(id),
  earning_id text NOT NULL REFERENCES reseller_ledger(id), cents integer NOT NULL CHECK(cents>0),
  PRIMARY KEY(payout_id,earning_id)
);
-- service-role/server-only; no direct anonymous/authenticated access.
ALTER TABLE reseller_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_subscription_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_history_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_payout_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reseller_companies,reseller_members,reseller_prices,reseller_prospects,reseller_activity,
 reseller_sales,reseller_ledger,reseller_reversals,reseller_disputes,reseller_onboarding,reseller_payouts,
 reseller_payout_allocations,reseller_subscription_states,reseller_history_work FROM anon,authenticated;
