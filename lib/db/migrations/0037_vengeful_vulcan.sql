CREATE TABLE "patient_text_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"account_id" text NOT NULL,
	"encrypted" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_text_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "patient_text_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"revision" integer NOT NULL,
	"status" text DEFAULT 'blocked' NOT NULL,
	"kind" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_text_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "patient_text_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"role" text NOT NULL,
	"body" text NOT NULL,
	"delivery" text NOT NULL,
	"actor_id" text,
	"event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_text_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "patient_text_recipients" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"phone_key" text NOT NULL,
	"consent" boolean DEFAULT false NOT NULL,
	"consent_evidence" text,
	"timezone" text,
	"stopped" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_text_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "patient_text_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"ownership" text DEFAULT 'team' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"handoff_reason" text,
	"preferences" text,
	"next_opening" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_text_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "patient_text_intents" ADD CONSTRAINT "patient_text_intents_thread_id_patient_text_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."patient_text_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_text_messages" ADD CONSTRAINT "patient_text_messages_thread_id_patient_text_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."patient_text_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_text_threads" ADD CONSTRAINT "patient_text_threads_recipient_id_patient_text_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."patient_text_recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "patient_text_connection_kind_idx" ON "patient_text_connections" USING btree ("owner_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_text_message_order_idx" ON "patient_text_messages" USING btree ("thread_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_text_message_event_idx" ON "patient_text_messages" USING btree ("owner_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_text_recipient_person_idx" ON "patient_text_recipients" USING btree ("owner_id","phone_key");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_text_thread_recipient_idx" ON "patient_text_threads" USING btree ("recipient_id");