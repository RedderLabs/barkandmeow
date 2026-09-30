CREATE TABLE "recuperaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"sujeto_id" uuid,
	"id_index" "bytea",
	"reto" text,
	"pruebas" integer DEFAULT 0 NOT NULL,
	"code_hash" text,
	"code_attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"usada_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "recovery_pub" "bytea";--> statement-breakpoint
CREATE INDEX "recuperaciones_caduca_ix" ON "recuperaciones" USING btree ("expires_at");