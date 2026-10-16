CREATE TABLE "portal_auth_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_auth_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "portal_auth_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"credential_version" uuid,
	"code_hash" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"next_path" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_auth_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "portal_auth_credentials" (
	"participant_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"version" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_auth_credentials" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "portal_auth_credentials" ADD CONSTRAINT "portal_credentials_participant_fk"
  FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "portal_auth_challenges" ADD CONSTRAINT "portal_challenges_participant_fk"
  FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "portal_challenges_participant_purpose" ON "portal_auth_challenges" ("participant_id", "purpose");