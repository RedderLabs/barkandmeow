ALTER TABLE "clinic_api_keys" ADD COLUMN "firma_pub" "bytea";--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_api_key_id_clinic_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."clinic_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blobs_passport_uq" ON "blobs" USING btree ("pet_id") WHERE "blobs"."kind" = 'passport';