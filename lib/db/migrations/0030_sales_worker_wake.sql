-- Approved additive scheduler setup. Credentials are provisioned into Vault separately.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
--> statement-breakpoint
-- The request queue briefly contains authorization headers. It is not application data.
REVOKE ALL ON SCHEMA net FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA net FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA net FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA net TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net TO postgres;