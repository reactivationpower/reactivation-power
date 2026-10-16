-- The original task migration may already have been applied in shared
-- Supabase before its number collided with a concurrent task on merge.
ALTER TABLE "portal_auth_limits" ADD COLUMN IF NOT EXISTS "window_seconds" integer;