-- Additive first-party marketing analytics. No changes to existing sales,
-- affiliate, patient or billing tables. Public roles have no direct access.
CREATE TABLE marketing_settings (
 id text PRIMARY KEY DEFAULT 'marketing' CHECK (id='marketing'),
 attribution_days integer NOT NULL DEFAULT 90 CHECK(attribution_days BETWEEN 1 AND 365),
 session_minutes integer NOT NULL DEFAULT 30 CHECK(session_minutes BETWEEN 5 AND 120),
 retention_days integer NOT NULL DEFAULT 180 CHECK(retention_days BETWEEN 1 AND 730)
);
INSERT INTO marketing_settings(id) VALUES('marketing');
CREATE TABLE marketing_pages (
 id text PRIMARY KEY, path text UNIQUE NOT NULL, label text NOT NULL,
 funnel text NOT NULL, active boolean NOT NULL DEFAULT true
);
INSERT INTO marketing_pages(id,path,label,funnel) VALUES
 ('home','/','Main website','website'),
 ('walkthrough','/walkthrough','Full walkthrough','website'),
 ('healthcare','/healthcare','Healthcare','website'),
 ('schedule','/schedule-a-call','Schedule a call','website'),
 ('calendar','/healthcare/book-a-call','Calendar','website'),
 ('confirmation','/schedule-a-call/confirmation','Website confirmation','website'),
 ('strategy','/strategy-call','Strategy call','strategy'),
 ('strategy-schedule','/strategy-call/schedule','Strategy schedule','strategy'),
 ('strategy-rejected','/strategy-call/providers-only','Providers only','strategy'),
 ('strategy-confirmation','/healthcare/thank-you','Strategy confirmation','strategy'),
 ('analytics-test','/analytics-test','Instrumentation test','test');
CREATE TABLE marketing_sources (
 id uuid PRIMARY KEY, name text NOT NULL, notes text NOT NULL DEFAULT '',
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE marketing_links (
 id uuid PRIMARY KEY, source_id uuid NOT NULL REFERENCES marketing_sources(id),
 code text UNIQUE NOT NULL, campaign text NOT NULL, channel text NOT NULL,
 page_id text NOT NULL REFERENCES marketing_pages(id), active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE marketing_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor text NOT NULL,
 entity text NOT NULL, entity_id text NOT NULL, before_value jsonb, after_value jsonb,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE marketing_visitors (
 id uuid PRIMARY KEY, secret_hash text NOT NULL, lead_id text REFERENCES sales_leads(id),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 classification text NOT NULL CHECK(classification IN ('observed','internal','test','bot')),
 removed_at timestamptz
);
CREATE TABLE marketing_sessions (
 id uuid PRIMARY KEY, visitor_id uuid NOT NULL REFERENCES marketing_visitors(id) ON DELETE CASCADE,
 lead_id text REFERENCES sales_leads(id), started_at timestamptz NOT NULL DEFAULT now(),
 last_at timestamptz NOT NULL DEFAULT now(), entry_page text NOT NULL REFERENCES marketing_pages(id),
 funnel text NOT NULL, device text NOT NULL CHECK(device IN ('desktop','mobile','tablet','unknown'))
);
CREATE INDEX marketing_sessions_visitor ON marketing_sessions(visitor_id,started_at);
CREATE INDEX marketing_sessions_lead ON marketing_sessions(lead_id,started_at DESC);
CREATE TABLE marketing_touches (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 visitor_id uuid NOT NULL REFERENCES marketing_visitors(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES marketing_sessions(id) ON DELETE CASCADE,
 occurred_at timestamptz NOT NULL DEFAULT now(), attribution jsonb NOT NULL
);
CREATE INDEX marketing_touches_visitor ON marketing_touches(visitor_id,occurred_at);
CREATE TABLE marketing_events (
 id uuid PRIMARY KEY, version integer NOT NULL CHECK(version=1),
 session_id uuid NOT NULL REFERENCES marketing_sessions(id) ON DELETE CASCADE,
 page_id text NOT NULL REFERENCES marketing_pages(id), kind text NOT NULL,
 occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 detail jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX marketing_events_session ON marketing_events(session_id,occurred_at,id);
CREATE INDEX marketing_events_retention ON marketing_events(received_at);
CREATE TABLE marketing_conversions (
 id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('lead','booking','customer','payment','refund','dispute')),
 lead_id text REFERENCES sales_leads(id), customer_id text,
 visitor_id uuid, session_id uuid, funnel text,
 occurred_at timestamptz NOT NULL, first_touch jsonb NOT NULL, last_touch jsonb NOT NULL,
 amount_cents bigint NOT NULL DEFAULT 0, currency text,
 classification text NOT NULL DEFAULT 'observed',
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_conversions_lead ON marketing_conversions(lead_id,occurred_at);
CREATE TABLE marketing_daily_totals (
 day date NOT NULL, page_id text NOT NULL, kind text NOT NULL, classification text NOT NULL,
 events bigint NOT NULL, PRIMARY KEY(day,page_id,kind,classification)
);
CREATE TABLE marketing_limits (
 key text PRIMARY KEY, window_at timestamptz NOT NULL, requests integer NOT NULL
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['marketing_settings','marketing_pages','marketing_sources','marketing_links',
 'marketing_audit','marketing_visitors','marketing_sessions','marketing_touches','marketing_events',
 'marketing_conversions','marketing_daily_totals','marketing_limits'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated',t);
 END LOOP;
END $$;
