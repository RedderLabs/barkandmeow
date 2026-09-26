import { z } from "zod";
import { identificador } from "./identifiers.js";
import { codigoEspecie } from "./species.js";

/* Contratos de la API. El servidor valida con esto y nunca ve nada en claro:
   todo lo que lleva contenido clínico viaja como bytes opacos en base64. */

export const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, "base64");

export const rol = z.enum(["admin", "vet", "assistant"]);
export type Rol = z.infer<typeof rol>;

/* ── Nivel 0: localizar ──────────────────────────────────── */

export const chipLookupBody = z.object({
  identificador,
  /** Clave pública X25519 del navegador, si ya quiere pedir el alta. */
  vetPubKey: base64.optional(),
});

/** Misma forma exista o no la ficha: el tamaño no puede delatar nada. */
export const chipLookupRespuesta = z.object({
  existe: z.boolean(),
  origen: z
    .object({ clase: z.string(), codigo: z.string(), iso2: z.string().nullable() })
    .nullable(),
  requestId: z.string().uuid().nullable(),
  sas: z.string().regex(/^\d{6}$/).nullable(),
});

/* ── Alta de nivel 3 ─────────────────────────────────────── */

export const grantRequestBody = z.object({
  identificador,
  vetPubKey: base64,
});

export const grantApproveBody = z.object({
  requestId: z.string().uuid(),
  /** K envuelta para la clave pública del veterinario. El servidor no la abre. */
  wrappedKey: base64,
});

export const grantRevokeBody = z.object({
  grantId: z.string().uuid(),
});

export const estadoPeticion = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
]);

/* ── Clínicas y equipo ───────────────────────────────────── */

export const clinicRegisterBody = z.object({
  nombre: z.string().min(2).max(160),
  pais: z.string().length(2),
  registroSanitario: z.string().max(64).optional(),
  dominio: z.string().max(253).optional(),
  /** Clave pública de la clínica, generada en el navegador del administrador. */
  pubKey: base64,
  admin: z.object({
    nombre: z.string().min(2).max(160),
    email: z.string().email(),
    password: z.string().min(12).max(200),
    devicePubKey: base64,
  }),
});

export const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export const memberInviteBody = z.object({
  nombre: z.string().min(2).max(160),
  email: z.string().email(),
  rol,
});

export const memberAcceptBody = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(12).max(200),
  devicePubKey: base64,
  /** Clave de la clínica envuelta por el administrador. Solo para admin. */
  wrappedClinicKey: base64.optional(),
});

/* ── Borradores: ficha preparada sin dueño todavía ───────── */

export const draftCreateBody = z.object({
  especie: codigoEspecie,
  identificadores: z.array(identificador).min(0).max(4),
  /** Contenido cifrado con la clave de la clínica. Opaco para el servidor. */
  sealed: base64,
});

/* ── Bloques cifrados ────────────────────────────────────── */

export const blobKind = z.enum(["record", "emergency", "document", "share"]);

export const blobPutBody = z.object({
  petId: z.string().uuid(),
  kind: blobKind,
  sealed: base64,
  version: z.number().int().nonnegative(),
});

export type ChipLookupRespuesta = z.infer<typeof chipLookupRespuesta>;
export type ClinicRegisterBody = z.infer<typeof clinicRegisterBody>;
