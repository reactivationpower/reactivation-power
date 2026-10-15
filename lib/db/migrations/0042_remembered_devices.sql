CREATE TABLE "portal_auth_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" uuid NOT NULL,
	"credential_version" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "portal_auth_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "portal_devices_participant" ON "portal_auth_devices" USING btree ("participant_id");--> statement-breakpoint
ALTER TABLE "portal_auth_devices" ADD CONSTRAINT "portal_devices_participant_fk"
  FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE;
