CREATE TABLE "error_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"level" text DEFAULT 'error' NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetry_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"client_version" text,
	"mcp_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "error_reports" ADD CONSTRAINT "error_reports_user_id_telemetry_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."telemetry_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "error_reports_created_at_idx" ON "error_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "error_reports_user_id_idx" ON "error_reports" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telemetry_users_fingerprint_key" ON "telemetry_users" USING btree ("fingerprint");