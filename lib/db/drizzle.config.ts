import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit targets the Supabase Postgres (the only app database).
 *
 * Schema changes are shipped as migrations, never with `drizzle-kit push`:
 * Supabase's public schema also holds tables that are not modelled here
 * (participants, payment_links, courses …) and push would try to drop them.
 * Workflow: edit src/schema → `pnpm --filter @workspace/db run generate` →
 * review the SQL in ./migrations → `pnpm --filter @workspace/db run migrate`.
 */
const raw = process.env.SUPABASE_DB_URL?.trim();
if (!raw) {
  throw new Error("SUPABASE_DB_URL must be set to the Supabase Postgres connection string (Session pooler URI).");
}
const url = new URL(raw);
// hint: Logic changed on both sides. Requires understanding intent of each change.

export default defineConfig({
  // Relative to this package; run the scripts through `pnpm --filter @workspace/db`.
  // (drizzle-kit mangles absolute `out` paths once a snapshot exists.)
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, "") || "postgres",
    // Supabase's pooler certificate is signed by Supabase's own CA.
    ssl: { rejectUnauthorized: false },
  },
  // Only tables modelled in src/schema are managed; everything else in
  // Supabase's public schema is left alone.
  tablesFilter: [
    "sales_leads", "sales_submissions", "sales_activities", "sales_jobs",
    "sales_settings", "sales_preferences", "sales_imports", "sales_merge_reviews",
    "enrollment_notification_rollout",
    "enrollment_notifications",
    "enrollment_notification_state",
    "enrollment_notification_preferences",
    "auth_idle_sessions",
    "portal_auth_credentials",
    "portal_auth_challenges",
    "portal_auth_limits",
    "patient_sources",
    "contact_services",
    "patient_call_leases",
    "patient_service_events",
    "patient_import_reviews",
    "email_log",
    "customers",
    "payment_link_terms",
    "customer_cards",
    "stripe_events",
    "payment_history",
    "billing_links",
    "agreements",
    "agreement_versions",
    "agreement_initials",
    "agreement_events",
    "agreement_deliveries",
    "commission_entries",
    "cron_runs",
    "billing_notifications",
    "product_access",
    "lead_campaigns",
    "campaign_leads",
    "campaign_webhook_events",
    "lead_calls",
  ],
});
