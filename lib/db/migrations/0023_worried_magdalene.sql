CREATE TABLE "enrollment_notification_preferences" (
	"admin_id" text PRIMARY KEY NOT NULL,
	"sound" boolean DEFAULT false NOT NULL,
	"desktop" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enrollment_notification_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "enrollment_notification_rollout" (
	"id" text PRIMARY KEY NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enrollment_notification_rollout" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "enrollment_notification_state" (
	"admin_id" text NOT NULL,
	"event_id" bigint NOT NULL,
	"read_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "enrollment_notification_state_admin_id_event_id_pk" PRIMARY KEY("admin_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "enrollment_notification_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "enrollment_notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agreement_id" text NOT NULL,
	"milestone" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enrollment_notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agreements" ADD COLUMN "display_acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enrollment_notification_state" ADD CONSTRAINT "enrollment_notification_state_event_id_enrollment_notifications_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."enrollment_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrollment_notification_state_admin_idx" ON "enrollment_notification_state" USING btree ("admin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_notifications_milestone_idx" ON "enrollment_notifications" USING btree ("agreement_id","milestone");
--> statement-breakpoint
-- Rollout boundary is fixed once, not reset by a restart or a deployment.
INSERT INTO "enrollment_notification_rollout" ("id") VALUES ('enrollment') ON CONFLICT DO NOTHING;