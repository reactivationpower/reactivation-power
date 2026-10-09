-- Reconcile the combined schema after concurrent migration metadata collided.
-- The incoming auth-retention migration may already be applied in shared Supabase.
ALTER TABLE "portal_auth_limits" ADD COLUMN IF NOT EXISTS "window_seconds" integer;