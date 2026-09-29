DROP INDEX "clinics_domain_uq";--> statement-breakpoint
CREATE INDEX "clinics_domain_ix" ON "clinics" USING btree ("domain");