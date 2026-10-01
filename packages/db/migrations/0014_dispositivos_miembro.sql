CREATE TABLE "dispositivos_miembro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"pub_key" "bytea" NOT NULL,
	"clave_etiquetas" "bytea",
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dispositivos_miembro" ADD CONSTRAINT "dispositivos_miembro_member_id_clinic_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."clinic_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dispositivos_miembro_uq" ON "dispositivos_miembro" USING btree ("member_id","pub_key");