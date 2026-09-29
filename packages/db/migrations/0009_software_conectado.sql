CREATE TABLE "clinic_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefijo" text NOT NULL,
	"creada_por" uuid,
	"ultimo_uso" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "envios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"api_key_id" uuid,
	"pet_id" uuid NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "clinic_api_keys" ADD CONSTRAINT "clinic_api_keys_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_api_keys" ADD CONSTRAINT "clinic_api_keys_creada_por_clinic_members_id_fk" FOREIGN KEY ("creada_por") REFERENCES "public"."clinic_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios" ADD CONSTRAINT "envios_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios" ADD CONSTRAINT "envios_api_key_id_clinic_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."clinic_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios" ADD CONSTRAINT "envios_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_api_keys_token_uq" ON "clinic_api_keys" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "clinic_api_keys_clinic_ix" ON "clinic_api_keys" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "envios_clinic_ix" ON "envios" USING btree ("clinic_id","created_at");--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE set null ON UPDATE no action;