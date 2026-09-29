CREATE TABLE "owner_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"estado" text NOT NULL,
	"code_hash" text,
	"code_attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"pub_key" "bytea" NOT NULL,
	"email_verified_at" timestamp,
	"email_code_hash" text,
	"email_code_expires_at" timestamp,
	"email_code_attempts" integer DEFAULT 0 NOT NULL,
	"email_code_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pet_profiles" ADD COLUMN "nombre" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "chip_pista" text;--> statement-breakpoint
ALTER TABLE "owner_sessions" ADD CONSTRAINT "owner_sessions_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "owner_sessions_token_uq" ON "owner_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "owners_email_uq" ON "owners" USING btree ("email");