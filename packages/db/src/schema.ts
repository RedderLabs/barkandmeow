import {
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* El servidor solo conoce identificadores aleatorios, tamaños y fechas.
   No hay nombres de mascotas, dueños ni diagnósticos en claro en ninguna tabla.
   Todo lo que lleva contenido va en columnas `sealed`, que son bytes opacos. */

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const pets = pgTable("pets", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerPubKey: bytea("owner_pub_key").notNull(),
  pushToken: text("push_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* Un animal puede llevar chip ISO, chip antiguo, anilla y tatuaje a la vez.
   Solo se guarda el HMAC del valor: el servidor nunca ve el número en claro. */
export const petIdentifiers = pgTable(
  "pet_identifiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    petId: uuid("pet_id")
      .references(() => pets.id, { onDelete: "cascade" })
      .notNull(),
    kind: text("kind").$type<"iso" | "nonISO" | "ring" | "tattoo">().notNull(),
    idIndex: bytea("id_index").notNull(),
  },
  (t) => [uniqueIndex("pet_identifiers_index_uq").on(t.idIndex)],
);

export const blobs = pgTable(
  "blobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    petId: uuid("pet_id")
      .references(() => pets.id, { onDelete: "cascade" })
      .notNull(),
    kind: text("kind")
      .$type<"record" | "emergency" | "document" | "share">()
      .notNull(),
    /* Fase actual: el bloque cifrado vive en Postgres. Cuando entre Garage S3,
       el contenido se muda y `s3Key` pasa a ser el puntero. */
    sealed: bytea("sealed"),
    s3Key: text("s3_key"),
    version: integer("version").notNull().default(0),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("blobs_pet_kind_ix").on(t.petId, t.kind)],
);

export const clinics = pgTable(
  "clinics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    country: text("country").notNull(),
    healthRegistry: text("health_registry"),
    domain: text("domain"),
    domainVerifiedAt: timestamp("domain_verified_at"),
    domainToken: text("domain_token"),
    pubKey: bytea("pub_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("clinics_domain_uq").on(t.domain)],
);

export const clinicMembers = pgTable(
  "clinic_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .references(() => clinics.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role").$type<"admin" | "vet" | "assistant">().notNull(),
    passwordHash: text("password_hash"),
    devicePubKey: bytea("device_pub_key"),
    /* Solo los administradores reciben la clave de la clínica envuelta. */
    wrappedClinicKey: bytea("wrapped_clinic_key"),
    inviteTokenHash: text("invite_token_hash"),
    acceptedAt: timestamp("accepted_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("clinic_members_email_uq").on(t.email)],
);

export const clinicSessions = pgTable(
  "clinic_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id")
      .references(() => clinicMembers.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("clinic_sessions_token_uq").on(t.tokenHash)],
);

/* Petición de alta de nivel 3. El número de comparación no se guarda:
   las dos partes lo derivan de las claves públicas y del id. */
export const grantRequests = pgTable(
  "grant_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    petId: uuid("pet_id")
      .references(() => pets.id, { onDelete: "cascade" })
      .notNull(),
    clinicId: uuid("clinic_id")
      .references(() => clinics.id, { onDelete: "cascade" })
      .notNull(),
    vetPubKey: bytea("vet_pub_key").notNull(),
    state: text("state")
      .$type<"pending" | "approved" | "rejected" | "expired">()
      .notNull()
      .default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("grant_requests_clinic_ix").on(t.clinicId, t.createdAt)],
);

export const grants = pgTable(
  "grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    petId: uuid("pet_id")
      .references(() => pets.id, { onDelete: "cascade" })
      .notNull(),
    clinicId: uuid("clinic_id").references(() => clinics.id, {
      onDelete: "cascade",
    }),
    level: integer("level").notNull(),
    wrappedKey: bytea("wrapped_key"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("grants_pet_ix").on(t.petId)],
);

export const inbox = pgTable("inbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  petId: uuid("pet_id")
    .references(() => pets.id, { onDelete: "cascade" })
    .notNull(),
  sealed: bytea("sealed").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* Ficha preparada por la clínica para un dueño que todavía no usa Bark & Meow.
   Cifrada con la clave de la clínica y caducada a 90 días. No responde a
   búsquedas de nivel 0 hasta que el dueño la reclama. */
export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .references(() => clinics.id, { onDelete: "cascade" })
      .notNull(),
    species: text("species").notNull(),
    sealed: bytea("sealed").notNull(),
    claimedByPetId: uuid("claimed_by_pet_id").references(() => pets.id),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("drafts_clinic_ix").on(t.clinicId, t.expiresAt)],
);

/* Cada apertura queda firmada y se envía cifrada al dueño; esto es solo el
   contador que permite detectar a quien recorre números. */
export const accessLog = pgTable(
  "access_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id").references(() => clinics.id, {
      onDelete: "cascade",
    }),
    action: text("action").notNull(),
    found: text("found").$type<"yes" | "no">().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("access_log_clinic_ix").on(t.clinicId, t.createdAt)],
);
