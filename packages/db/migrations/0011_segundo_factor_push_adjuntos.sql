CREATE TABLE "inbox_adjuntos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbox_id" uuid NOT NULL,
	"orden" integer NOT NULL,
	"s3_key" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"plataforma" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"ultimo_uso" timestamp
);
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "telefono" text;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "telefono_verificado_at" timestamp;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "telefono_codigo_hash" text;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "telefono_codigo_caduca" timestamp;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "telefono_codigo_intentos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "segundo_factor" text DEFAULT 'correo' NOT NULL;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "sms_dia" text;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "sms_enviados" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "sms_ultimo" timestamp;--> statement-breakpoint
ALTER TABLE "reclamaciones" ADD COLUMN "nota_operador" text;--> statement-breakpoint
ALTER TABLE "inbox_adjuntos" ADD CONSTRAINT "inbox_adjuntos_inbox_id_inbox_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."inbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_devices" ADD CONSTRAINT "owner_devices_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_adjuntos_inbox_ix" ON "inbox_adjuntos" USING btree ("inbox_id");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_devices_token_uq" ON "owner_devices" USING btree ("token");--> statement-breakpoint
CREATE INDEX "owner_devices_owner_ix" ON "owner_devices" USING btree ("owner_id");