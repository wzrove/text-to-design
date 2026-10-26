ALTER TABLE "error_reports" ADD COLUMN "error_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "error_reports_error_id_key" ON "error_reports" USING btree ("error_id");