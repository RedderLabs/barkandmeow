import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
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

/* Cuenta del portal del dueño (decidido 2026-09-27). Entra con el número de
   chip, su contraseña y un código que le llega por correo. Su clave X25519
   sale de un código de recuperación en papel, generado en su navegador: el
   servidor solo guarda la pública, a la que se sellan notas y avisos. */
export const owners = pgTable("owners", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  pubKey: bytea("pub_key").notNull(),
  emailVerifiedAt: timestamp("email_verified_at"),
  emailCodeHash: text("email_code_hash"),
  emailCodeExpiresAt: timestamp("email_code_expires_at"),
  emailCodeAttempts: integer("email_code_attempts").notNull().default(0),
  emailCodeSentAt: timestamp("email_code_sent_at"),
  /* Segundo factor por SMS (decidido 2026-09-30). El teléfono, en E.164, solo
     cuenta como canal cuando está confirmado con un código. Sirve para entrar,
     no se publica en ningún sitio. */
  telefono: text("telefono"),
  telefonoVerificadoAt: timestamp("telefono_verificado_at"),
  telefonoCodigoHash: text("telefono_codigo_hash"),
  telefonoCodigoCaduca: timestamp("telefono_codigo_caduca"),
  telefonoCodigoIntentos: integer("telefono_codigo_intentos").notNull().default(0),
  /** Por dónde llega el código de entrada. «sms» solo con el teléfono confirmado. */
  segundoFactor: text("segundo_factor").$type<"correo" | "sms">().notNull().default("correo"),
  /* Cada SMS cuesta dinero: tope diario por cuenta. */
  smsDia: text("sms_dia"),
  smsEnviados: integer("sms_enviados").notNull().default(0),
  smsUltimo: timestamp("sms_ultimo"),
  /* Clave pública Ed25519 que sale de la clave del código en papel. Con ella
     el dueño demuestra que tiene el papel al recuperar la contraseña; el
     servidor solo comprueba firmas, no puede derivarla ni usarla. */
  recoveryPub: bytea("recovery_pub"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("owners_email_uq").on(t.email)]);

/* Móviles del dueño que reciben avisos push (decidido 2026-09-30). El aviso
   no lleva contenido: solo que hay algo nuevo. Lo que dice sigue sellado en
   la bandeja. */
export const ownerDevices = pgTable("owner_devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .references(() => owners.id, { onDelete: "cascade" })
    .notNull(),
  plataforma: text("plataforma").$type<"expo">().notNull(),
  token: text("token").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  ultimoUso: timestamp("ultimo_uso"),
}, (t) => [uniqueIndex("owner_devices_token_uq").on(t.token), index("owner_devices_owner_ix").on(t.ownerId)]);

/* Sesión del dueño. «pendiente»: contraseña correcta, falta el código del
   correo; no abre nada hasta confirmarlo. */
export const ownerSessions = pgTable("owner_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .references(() => owners.id, { onDelete: "cascade" })
    .notNull(),
  tokenHash: text("token_hash").notNull(),
  estado: text("estado").$type<"pendiente" | "abierta">().notNull(),
  codeHash: text("code_hash"),
  codeAttempts: integer("code_attempts").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("owner_sessions_token_uq").on(t.tokenHash)]);

/* Estado del registro (decidido 2026-09-27). Un chip lo puede registrar
   cualquiera, así que un registro nace «pendiente» y no responde a ninguna
   consulta hasta que una clínica verificada lee el chip con el animal delante
   y lo activa con el código de activación que el dueño lleva en su app.
   «congelada»: hay una reclamación abierta contra este registro. «retirada»:
   perdió una reclamación; se conserva para el historial. */
export const pets = pgTable("pets", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerPubKey: bytea("owner_pub_key").notNull(),
  pushToken: text("push_token"),
  estado: text("estado")
    .$type<"pendiente" | "activa" | "congelada" | "retirada">()
    .notNull()
    .default("activa"),
  activationCodeHash: text("activation_code_hash"),
  activationExpiresAt: timestamp("activation_expires_at"),
  activationAttempts: integer("activation_attempts").notNull().default(0),
  activatedAt: timestamp("activated_at"),
  activatedByClinicId: uuid("activated_by_clinic_id"),
  /** Cuenta del portal del dueño, si la mascota se dio de alta desde ahí. */
  ownerId: uuid("owner_id"),
  /** Últimos 4 dígitos del chip, para que el dueño distinga sus mascotas. El
      número completo nunca se guarda: solo su HMAC en pet_identifiers. */
  chipPista: text("chip_pista"),
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
    /* Solo el identificador de un registro activo es único y responde a
       búsquedas. Los pendientes no reservan nada: registrar primero el chip de
       una mascota ajena no bloquea a su dueño. */
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    uniqueIndex("pet_identifiers_activo_uq").on(t.idIndex).where(sql`${t.activo}`),
    index("pet_identifiers_index_ix").on(t.idIndex),
  ],
);

/* Reclamación de un chip ya activado por otra persona. La abre una clínica
   verificada con el animal delante y el código de activación del reclamante.
   El registro actual queda congelado; si en 14 días su titular no la
   impugna, el chip pasa al reclamante. */
export const reclamaciones = pgTable(
  "reclamaciones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** El registro activo que se reclama. */
    petId: uuid("pet_id")
      .references(() => pets.id, { onDelete: "cascade" })
      .notNull(),
    /** El registro pendiente de quien reclama. */
    reclamantePetId: uuid("reclamante_pet_id")
      .references(() => pets.id, { onDelete: "cascade" })
      .notNull(),
    clinicId: uuid("clinic_id")
      .references(() => clinics.id)
      .notNull(),
    estado: text("estado")
      .$type<"abierta" | "impugnada" | "a-favor-reclamante" | "a-favor-titular">()
      .notNull()
      .default("abierta"),
    plazo: timestamp("plazo").notNull(),
    resueltaAt: timestamp("resuelta_at"),
    /** Por qué la resolvió así el operador, si pasó por revisión manual. */
    notaOperador: text("nota_operador"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("reclamaciones_estado_ix").on(t.estado, t.plazo)],
);

/* Perfil público de la mascota: foto, bio y teléfonos para caso de pérdida.
   Es la única excepción a «nada en claro»: su función es que lo vea quien
   encuentre al animal (placa, número de chip, ficha del veterinario). Lo
   escribe el dueño desde su app o su portal, elige qué publica, y hasta que
   no lo publica no sale en ninguna respuesta. Decidido el 2026-09-27. */
export const petProfiles = pgTable("pet_profiles", {
  petId: uuid("pet_id")
    .primaryKey()
    .references(() => pets.id, { onDelete: "cascade" }),
  publicado: boolean("publicado").notNull().default(false),
  /** Cómo se llama: a quien lo encuentra le sirve para llamarlo. */
  nombre: text("nombre").notNull().default(""),
  bio: text("bio").notNull().default(""),
  telefonos: jsonb("telefonos")
    .$type<{ etiqueta: string; numero: string }[]>()
    .notNull()
    .default([]),
  /* La foto se sirve por un id propio y aleatorio: la URL no delata el petId. */
  fotoId: uuid("foto_id"),
  /* La foto vive en el almacén de objetos (B2), en `fotoKey`. `foto` queda
     para las subidas anteriores al almacén, que se siguen sirviendo. */
  fotoKey: text("foto_key"),
  foto: bytea("foto"),
  fotoTipo: text("foto_tipo").$type<"image/jpeg" | "image/png" | "image/webp">(),
  actualizado: timestamp("actualizado").defaultNow().notNull(),
}, (t) => [uniqueIndex("pet_profiles_foto_uq").on(t.fotoId)]);

export const blobs = pgTable(
  "blobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    petId: uuid("pet_id")
      .references(() => pets.id, { onDelete: "cascade" })
      .notNull(),
    kind: text("kind")
      /* passport: el pasaporte de viaje del dueño, cifrado con su clave. */
      .$type<"record" | "emergency" | "document" | "share" | "passport">()
      .notNull(),
    /* Fase actual: el bloque cifrado vive en Postgres. Cuando entre Garage S3,
       el contenido se muda y `s3Key` pasa a ser el puntero. */
    sealed: bytea("sealed"),
    s3Key: text("s3_key"),
    version: integer("version").notNull().default(0),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("blobs_pet_kind_ix").on(t.petId, t.kind),
    // Un solo pasaporte por mascota: dos navegadores que lo crean a la vez no lo duplican.
    uniqueIndex("blobs_passport_uq").on(t.petId).where(sql`${t.kind} = 'passport'`),
  ],
);

export const clinics = pgTable(
  "clinics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    country: text("country").notNull(),
    healthRegistry: text("health_registry"),
    address: text("address"),
    domain: text("domain"),
    domainVerifiedAt: timestamp("domain_verified_at"),
    domainToken: text("domain_token"),
    pubKey: bytea("pub_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  /* Sin unicidad: un registro sin verificar no reserva el dominio (si no,
     cualquiera bloquearía vet.es registrándose con admin@vet.es y sin
     confirmar nunca), y varias sedes de una misma organización pueden
     verificarse cada una con su correo. */
  (t) => [index("clinics_domain_ix").on(t.domain)],
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
    /* Una invitación sin aceptar caduca: si no, ocupa el correo para siempre. */
    inviteExpiresAt: timestamp("invite_expires_at"),
    /* Verificación del correo por código. El código solo se guarda como hash,
       caduca y admite pocos intentos. */
    emailVerifiedAt: timestamp("email_verified_at"),
    emailCodeHash: text("email_code_hash"),
    emailCodeExpiresAt: timestamp("email_code_expires_at"),
    emailCodeAttempts: integer("email_code_attempts").notNull().default(0),
    emailCodeSentAt: timestamp("email_code_sent_at"),
    acceptedAt: timestamp("accepted_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("clinic_members_email_uq").on(t.email)],
);

/* Recuperación de contraseña, de dueños y de miembros de clínica. Caduca a
   los 15 minutos y el código solo se guarda como hash. Para el dueño hay un
   paso antes: firmar `reto` con la clave del papel; hasta entonces `sujetoId`
   va vacío y solo se sabe el chip (`idIndex`). */
export const recuperaciones = pgTable(
  "recuperaciones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tipo: text("tipo").$type<"dueno" | "miembro">().notNull(),
    /** El dueño o el miembro. Vacío hasta que la prueba sale bien. */
    sujetoId: uuid("sujeto_id"),
    idIndex: bytea("id_index"),
    reto: text("reto"),
    pruebas: integer("pruebas").notNull().default(0),
    codeHash: text("code_hash"),
    codeAttempts: integer("code_attempts").notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
    usadaAt: timestamp("usada_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("recuperaciones_caduca_ix").on(t.expiresAt)],
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
  /* Solo en los informes que llegan del software de gestión: la clínica que
     los envió, según la clave de API. El contenido lo escribe la clínica; el
     remitente lo pone el servidor, y es lo que el dueño ve como origen. */
  clinicId: uuid("clinic_id").references(() => clinics.id, { onDelete: "set null" }),
  /** La clave con que llegó: su clave de firma es la que tiene que firmar. */
  apiKeyId: uuid("api_key_id").references(() => clinicApiKeys.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* PDF adjuntos a un informe del software de gestión (decidido 2026-09-30).
   Cada uno va sellado aparte para la clave del dueño y vive en el almacén de
   objetos. El registro firmado lleva el SHA-256 de cada PDF en claro: el
   dueño comprueba al abrirlo que es el que firmó la clínica. */
export const inboxAdjuntos = pgTable("inbox_adjuntos", {
  id: uuid("id").defaultRandom().primaryKey(),
  inboxId: uuid("inbox_id")
    .references(() => inbox.id, { onDelete: "cascade" })
    .notNull(),
  orden: integer("orden").notNull(),
  s3Key: text("s3_key").notNull(),
  bytes: integer("bytes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("inbox_adjuntos_inbox_ix").on(t.inboxId)]);

/* Clave de API con la que el software de gestión de una clínica envía
   informes (decidido 2026-09-29). La crea un administrador; el token solo se
   muestra al crearla y aquí se guarda su hash. No abre ninguna ficha: sirve
   para enviar informes sellados a los dueños que dieron el nivel 3. */
export const clinicApiKeys = pgTable(
  "clinic_api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .references(() => clinics.id, { onDelete: "cascade" })
      .notNull(),
    nombre: text("nombre").notNull(),
    tokenHash: text("token_hash").notNull(),
    /** Los primeros caracteres del token, para reconocerlo sin guardarlo. */
    prefijo: text("prefijo").notNull(),
    /* Clave pública Ed25519 con la que el software firma lo que envía. La
       secreta la genera el navegador del administrador y no pasa por aquí.
       Se conserva al retirar la clave: lo firmado antes sigue comprobándose. */
    firmaPub: bytea("firma_pub"),
    creadaPor: uuid("creada_por").references(() => clinicMembers.id, { onDelete: "set null" }),
    ultimoUso: timestamp("ultimo_uso"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("clinic_api_keys_token_uq").on(t.tokenHash),
    index("clinic_api_keys_clinic_ix").on(t.clinicId),
  ],
);

/* Registro de envíos de la clínica: qué clave envió un informe a qué mascota
   y cuándo. Sin contenido. Sobrevive a que el dueño borre el mensaje de su
   bandeja, para que la clínica sepa qué envió. */
export const envios = pgTable(
  "envios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .references(() => clinics.id, { onDelete: "cascade" })
      .notNull(),
    apiKeyId: uuid("api_key_id").references(() => clinicApiKeys.id, { onDelete: "set null" }),
    petId: uuid("pet_id")
      .references(() => pets.id, { onDelete: "cascade" })
      .notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("envios_clinic_ix").on(t.clinicId, t.createdAt)],
);

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
