CREATE TABLE "etiquetas_paciente" (
	"clinic_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"sealed" "bytea" NOT NULL,
	"escrita_por" uuid,
	"actualizada" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "etiquetas_paciente_clinic_id_pet_id_pk" PRIMARY KEY("clinic_id","pet_id")
);
--> statement-breakpoint
ALTER TABLE "etiquetas_paciente" ADD CONSTRAINT "etiquetas_paciente_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etiquetas_paciente" ADD CONSTRAINT "etiquetas_paciente_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etiquetas_paciente" ADD CONSTRAINT "etiquetas_paciente_escrita_por_clinic_members_id_fk" FOREIGN KEY ("escrita_por") REFERENCES "public"."clinic_members"("id") ON DELETE set null ON UPDATE no action;