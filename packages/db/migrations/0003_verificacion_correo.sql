ALTER TABLE "clinic_members" ADD COLUMN "email_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "clinic_members" ADD COLUMN "email_code_hash" text;--> statement-breakpoint
ALTER TABLE "clinic_members" ADD COLUMN "email_code_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "clinic_members" ADD COLUMN "email_code_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_members" ADD COLUMN "email_code_sent_at" timestamp;