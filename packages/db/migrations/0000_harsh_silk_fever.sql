CREATE TABLE "access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid,
	"action" text NOT NULL,
	"found" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"sealed" "bytea",
	"s3_key" text,
	"version" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text,
	"device_pub_key" "bytea",
	"wrapped_clinic_key" "bytea",
	"invite_token_hash" text,
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"health_registry" text,
	"domain" text,
	"domain_verified_at" timestamp,
	"domain_token" text,
	"pub_key" "bytea" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"species" text NOT NULL,
	"sealed" "bytea" NOT NULL,
	"claimed_by_pet_id" uuid,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grant_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"vet_pub_key" "bytea" NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"clinic_id" uuid,
	"level" integer NOT NULL,
	"wrapped_key" "bytea",
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"sealed" "bytea" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"id_index" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_pub_key" "bytea" NOT NULL,
	"push_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blobs" ADD CONSTRAINT "blobs_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_members" ADD CONSTRAINT "clinic_members_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_sessions" ADD CONSTRAINT "clinic_sessions_member_id_clinic_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."clinic_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_claimed_by_pet_id_pets_id_fk" FOREIGN KEY ("claimed_by_pet_id") REFERENCES "public"."pets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_requests" ADD CONSTRAINT "grant_requests_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_requests" ADD CONSTRAINT "grant_requests_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_identifiers" ADD CONSTRAINT "pet_identifiers_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_log_clinic_ix" ON "access_log" USING btree ("clinic_id","created_at");--> statement-breakpoint
CREATE INDEX "blobs_pet_kind_ix" ON "blobs" USING btree ("pet_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_members_email_uq" ON "clinic_members" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_sessions_token_uq" ON "clinic_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "clinics_domain_uq" ON "clinics" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "drafts_clinic_ix" ON "drafts" USING btree ("clinic_id","expires_at");--> statement-breakpoint
CREATE INDEX "grant_requests_clinic_ix" ON "grant_requests" USING btree ("clinic_id","created_at");--> statement-breakpoint
CREATE INDEX "grants_pet_ix" ON "grants" USING btree ("pet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pet_identifiers_index_uq" ON "pet_identifiers" USING btree ("id_index");