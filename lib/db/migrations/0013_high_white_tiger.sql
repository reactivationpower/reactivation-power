CREATE TABLE "auth_idle_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"last_interaction_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auth_idle_sessions" ENABLE ROW LEVEL SECURITY;
