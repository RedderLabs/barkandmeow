import { z } from "zod";
export { dominioDeCorreo } from "./correo.js";
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
  direccion: z.string().max(300).optional(),
  /** Clave pública de la clínica, generada en el navegador del administrador. */
  pubKey: base64,
  admin: z.object({
    nombre: z.string().min(2).max(160),
    email: z.string().email(),
    password: z.string().min(12).max(200),
    devicePubKey: base64,
  }),
});

/** Código de verificación del correo: 8 caracteres, se admite con guion. */
export const codigoCorreoBody = z.object({
  codigo: z.string().max(20),
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

/** La clave de la clínica sellada para el dispositivo de otro administrador. */
export const clinicKeyBody = z.object({ wrappedClinicKey: base64 });

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

/* ── Web del veterinario: notas y avisos sellados ────────── */

/** Sellado X25519 para el dueño. El servidor lo guarda sin poder abrirlo. */
const sellado = (maxBytes: number) =>
  base64.refine((s) => (s.length * 3) / 4 <= maxBytes, "demasiado grande");

export const notaBody = z.object({ sellado: sellado(64 * 1024) });

export const avisoBody = z.object({
  /** Token que entregó el nivel 0; con señuelo si no había ficha. */
  aviso: z.string().regex(/^[A-Za-z0-9_-]{40,96}$/),
  sellado: sellado(8 * 1024),
});

/* ── Registro de mascotas y activación en clínica ─────────── */

/** El dueño registra el chip desde su app o su portal: queda pendiente. */
export const petRegisterBody = z.object({
  identificador,
  /** Clave pública X25519 del dueño. */
  ownerPubKey: base64,
});

/** La clínica, con el animal delante: chip leído y código del dueño. */
export const activacionBody = z.object({
  identificador,
  codigo: z.string().max(20),
});

/* ── Portal del dueño ─────────────────────────────────────── */

export const ownerRegisterBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(200),
  /** Clave pública X25519 del dueño, derivada en su navegador del código en papel. */
  pubKey: base64,
  mascota: z.object({ identificador, nombre: z.string().max(60).default("") }),
});

export const ownerLoginBody = z.object({
  identificador,
  password: z.string().min(1).max(200),
});

export const ownerPetBody = z.object({ identificador, nombre: z.string().max(60).default("") });

export const perfilBody = z.object({
  nombre: z.string().max(60),
  bio: z.string().max(600),
  telefonos: z
    .array(
      z.object({
        etiqueta: z.string().max(30),
        numero: z.string().regex(/^\+?[0-9 ()-]{6,20}$/, "teléfono"),
      }),
    )
    .max(3),
  publicado: z.boolean(),
});

export type ChipLookupRespuesta = z.infer<typeof chipLookupRespuesta>;
export type ClinicRegisterBody = z.infer<typeof clinicRegisterBody>;
