CREATE TABLE "reclamaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"reclamante_pet_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"plazo" timestamp NOT NULL,
	"resuelta_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "pet_identifiers_index_uq";--> statement-breakpoint
ALTER TABLE "pet_identifiers" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "estado" text DEFAULT 'activa' NOT NULL;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "activation_code_hash" text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "activation_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "activation_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "activated_at" timestamp;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "activated_by_clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "reclamaciones" ADD CONSTRAINT "reclamaciones_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclamaciones" ADD CONSTRAINT "reclamaciones_reclamante_pet_id_pets_id_fk" FOREIGN KEY ("reclamante_pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclamaciones" ADD CONSTRAINT "reclamaciones_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reclamaciones_estado_ix" ON "reclamaciones" USING btree ("estado","plazo");--> statement-breakpoint
CREATE UNIQUE INDEX "pet_identifiers_activo_uq" ON "pet_identifiers" USING btree ("id_index") WHERE "pet_identifiers"."activo";--> statement-breakpoint
CREATE INDEX "pet_identifiers_index_ix" ON "pet_identifiers" USING btree ("id_index");