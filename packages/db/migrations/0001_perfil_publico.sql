CREATE TABLE "pet_profiles" (
	"pet_id" uuid PRIMARY KEY NOT NULL,
	"publicado" boolean DEFAULT false NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"telefonos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"foto_id" uuid,
	"foto" "bytea",
	"foto_tipo" text,
	"actualizado" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pet_profiles" ADD CONSTRAINT "pet_profiles_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pet_profiles_foto_uq" ON "pet_profiles" USING btree ("foto_id");