-- pg_net tables are owned by supabase_admin and grant PUBLIC access on this
-- hosted database. postgres cannot revoke it. Never queue the cron bearer there.
-- Synchronous HTTP consumes headers in memory and returns only status.
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;