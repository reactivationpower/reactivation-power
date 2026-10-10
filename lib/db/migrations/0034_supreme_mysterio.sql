CREATE TABLE "appointment_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"version" integer NOT NULL,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"snapshot" jsonb,
	"provider_id" text,
	"email_log_id" text,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "appointment_hosts" (
	"ghl_user_id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"name" text NOT NULL,
	"reply_email" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_message_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_at" timestamp with time zone,
	"readiness_confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "appointment_messages" (
	"appointment_id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"fingerprint" text,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reconcile_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"stopped" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment_deliveries" ADD CONSTRAINT "appointment_deliveries_appointment_id_appointment_messages_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment_messages"("appointment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_messages" ADD CONSTRAINT "appointment_messages_lead_id_sales_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_deliveries_due" ON "appointment_deliveries" USING btree ("state","due_at");--> statement-breakpoint
CREATE INDEX "appointment_messages_reconcile" ON "appointment_messages" USING btree ("stopped","reconcile_at");
--> statement-breakpoint
ALTER TABLE appointment_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_message_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON appointment_deliveries,appointment_hosts,appointment_message_settings,appointment_messages FROM anon,authenticated;