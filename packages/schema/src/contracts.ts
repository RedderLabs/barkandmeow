import { z } from "zod";
export { dominioDeCorreo } from "./correo";
import { identificador } from "./identifiers";
import { codigoEspecie } from "./species";

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

/** Lo que el dueño publica para quien encuentre al animal. Lo único en claro. */
export const perfilPublicoRespuesta = z.object({
  nombre: z.string(),
  bio: z.string(),
  telefonos: z.array(z.object({ etiqueta: z.string(), numero: z.string() })),
  /** Ruta relativa a la API (`/perfil/v1/foto/<id>`), o null. */
  foto: z.string().nullable(),
});

/** Misma forma exista o no la ficha: el tamaño no puede delatar nada. Sin
    ficha, `requestId`, `sas`, `aviso` y `ownerPubKey` son señuelos con la
    forma correcta, y `pad` rellena la respuesta hasta 4096 bytes. */
export const chipLookupRespuesta = z.object({
  existe: z.boolean(),
  /** Resuelto offline desde los tres primeros dígitos (tablas ICAR). */
  origen: z.object({
    clase: z.enum(["pais", "fabricante", "desconocido", "no-iso"]),
    codigo: z.string(),
    iso2: z.string().nullable(),
  }),
  requestId: z.string().uuid(),
  sas: z.string().regex(/^\d{6}$/),
  /** Token para avisar al dueño por /chip/v1/notify. */
  aviso: z.string(),
  /** Clave pública X25519 del dueño, para sellar el aviso. */
  ownerPubKey: base64,
  perfil: perfilPublicoRespuesta.nullable(),
  pad: z.string(),
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

/** El dueño rechaza la petición: el número no coincide, o no conoce la clínica. */
export const grantRejectBody = z.object({
  requestId: z.string().uuid(),
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

/* ── Consola de la clínica: el chip y los pacientes ───────── */

/** El chip leído en el mostrador, para saber qué toca hacer con él. */
export const chipClinicaBody = z.object({ identificador });

/** Etiqueta de un paciente, cifrada en el navegador de la clínica y rellena a
    tamaño fijo. Opaca para el servidor. */
export const etiquetaBody = z.object({ etiqueta: sellado(512) });

/* ── Software de gestión conectado por API ────────────────── */

export const apiKeyCreateBody = z.object({
  nombre: z.string().trim().min(1).max(60),
  /** Clave pública Ed25519 de la conexión. La secreta se genera y se queda en
      el navegador del administrador, que la entrega al software una vez. */
  firmaPub: base64.refine((s) => s.length === 44, "32 bytes"),
});

/** Buscar, entre los pacientes con nivel 3, el de un chip que el software ya conoce. */
export const pacienteBuscarBody = z.object({ identificador });

/** Tope de cada PDF adjunto, ya sellado (48 bytes más que el PDF). */
export const ADJUNTO_MAX = 8 * 1024 * 1024;
export const ADJUNTOS_POR_INFORME = 3;

/** Informe sellado en el software de la clínica para la clave pública del dueño. */
export const informeBody = z.object({
  petId: z.string().uuid(),
  sellado: sellado(64 * 1024),
  /** PDF sellados aparte, en el mismo orden que `adjuntos` del registro firmado. */
  adjuntos: z.array(sellado(ADJUNTO_MAX)).max(ADJUNTOS_POR_INFORME).default([]),
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

/** 32 bytes en base64 (44 caracteres con relleno). */
const clavePublica32 = base64.refine((s) => s.length === 44, "32 bytes");

export const ownerRegisterBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(200),
  /** Clave pública X25519 del dueño, derivada en su navegador del código en papel. */
  pubKey: base64,
  /** Clave pública Ed25519 de recuperación, derivada de la misma clave del papel. */
  recuperacionPub: clavePublica32.optional(),
  mascota: z.object({ identificador, nombre: z.string().max(60).default("") }),
});

export const ownerLoginBody = z.object({
  identificador,
  password: z.string().min(1).max(200),
});

/** El operador resuelve a mano una reclamación de chip, con su porqué. */
export const resolverReclamacionBody = z.object({
  aFavor: z.enum(["reclamante", "titular"]),
  nota: z.string().trim().min(5).max(2000),
});

/** Canal del código de entrada. */
export const segundoFactor = z.enum(["correo", "sms"]);

/** Reenviar el código, si se quiere, por el otro canal. */
export const reenvioBody = z.object({ canal: segundoFactor.optional() }).default({});

/** Teléfono para el segundo factor, tal como lo teclea el dueño. */
export const telefonoBody = z.object({ telefono: z.string().trim().min(8).max(24) });

export const segundoFactorBody = z.object({ canal: segundoFactor });

/** Móvil que recibe avisos push. El token lo da el servicio push de Expo. */
export const dispositivoBody = z.object({
  plataforma: z.literal("expo"),
  token: z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,64}\]$/),
});

/** Al salir de la app basta el token: la plataforma ya la sabe el servidor. */
export const dispositivoRetirarBody = dispositivoBody.pick({ token: true });

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

/* ── Recuperación de contraseña ───────────────────────────── */

const contrasenaNueva = z.string().min(12).max(200);

/** Dueño, paso 1: el chip. Devuelve un reto, haya cuenta o no. */
export const recuperacionInicioBody = z.object({ identificador });

/** Dueño, paso 2: el reto firmado con la clave de recuperación del papel. */
export const recuperacionPruebaBody = z.object({
  recuperacionId: z.string().uuid(),
  clave: clavePublica32,
  /** Ed25519, 64 bytes. */
  firma: base64.refine((s) => s.length === 88, "64 bytes"),
});

/** Último paso, dueño o miembro: el código recibido y la contraseña nueva. */
export const recuperacionFinBody = z.object({
  recuperacionId: z.string().uuid(),
  codigo: z.string().max(20),
  password: contrasenaNueva,
});

/** Dueños de antes de la recuperación: guardan su clave pública una vez. */
export const claveRecuperacionBody = z.object({ clave: clavePublica32 });

/** Miembro de clínica: su correo. */
export const recuperacionMiembroBody = z.object({ email: z.string().email().max(254) });

/** Lo que firma el dueño: separa el uso y ata la firma a esta recuperación. */
export const mensajeRecuperacion = (recuperacionId: string, reto: string) =>
  `bm:dueno:recuperacion:v1\n${recuperacionId}\n${reto}`;

/* ── Nombres de pacientes para todo el equipo ─────────────── */

/** El navegador de un miembro se presenta con su clave pública X25519. */
export const dispositivoClinicaBody = z.object({ devicePubKey: clavePublica32 });

/** La clave de las etiquetas, cifrada de la clínica a cada dispositivo (80 bytes). */
export const entregaEtiquetasBody = z.object({
  entregas: z
    .array(
      z.object({
        dispositivoId: z.string().uuid(),
        sellada: base64.refine((s) => s.length === 108, "80 bytes"),
      }),
    )
    .min(1)
    .max(50),
});
