CREATE TABLE "sales_inbox_inbound" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "sales_inbox_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"author_id" text,
	"author_name" text,
	"state" text NOT NULL,
	"provider_id" text,
	"email_log_id" text,
	"error" text,
	"fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_inbox_messages_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "sales_inbox_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"email_domain" text DEFAULT '' NOT NULL,
	"email_ready" boolean DEFAULT false NOT NULL,
	"sms_ready" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_inbox_threads" (
	"lead_id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	CONSTRAINT "sales_inbox_threads_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "sales_inbox_messages" ADD CONSTRAINT "sales_inbox_messages_lead_id_sales_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_inbox_threads" ADD CONSTRAINT "sales_inbox_threads_lead_id_sales_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_inbox_messages_thread" ON "sales_inbox_messages" USING btree ("lead_id","created_at");
--> statement-breakpoint
ALTER TABLE sales_inbox_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_inbox_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_inbox_inbound ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sales_inbox_settings,sales_inbox_threads,sales_inbox_messages,sales_inbox_inbound FROM anon,authenticated;