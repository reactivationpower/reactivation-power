CREATE TABLE "campaign_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"phone" text NOT NULL,
	"phone_key" text NOT NULL,
	"email" text,
	"source" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_time" text,
	"message" text,
	"status" text DEFAULT 'new' NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lead_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"created_by" text,
	"niche_id" text NOT NULL,
	"name" text NOT NULL,
	"offer_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"regular_price_cents" integer,
	"offer_price_cents" integer,
	"price_line_style" text NOT NULL,
	"urgency_note" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "product_access" (
	"participant_id" text NOT NULL,
	"product" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_access_participant_id_product_pk" PRIMARY KEY("participant_id","product")
);
--> statement-breakpoint
ALTER TABLE "product_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_campaign_id_lead_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."lead_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_leads_campaign_phone_idx" ON "campaign_leads" USING btree ("campaign_id","phone_key");--> statement-breakpoint
CREATE INDEX "campaign_leads_campaign_submitted_idx" ON "campaign_leads" USING btree ("campaign_id","submitted_at");--> statement-breakpoint
CREATE INDEX "campaign_leads_owner_idx" ON "campaign_leads" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "lead_campaigns_owner_idx" ON "lead_campaigns" USING btree ("owner_id","status");