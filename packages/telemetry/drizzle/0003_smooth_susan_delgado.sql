DROP INDEX "error_reports_error_id_key";--> statement-breakpoint
ALTER TABLE "error_reports" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "error_reports" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "error_reports" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "error_reports" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "error_reports" ADD COLUMN "last_seen" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "error_reports_user_fingerprint_key" ON "error_reports" USING btree ("user_id","fingerprint");