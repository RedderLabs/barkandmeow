import { z } from "zod";
import {
  apiKeyCreateBody,
  clinicKeyBody,
  clinicRegisterBody,
  codigoCorreoBody,
  draftCreateBody,
  informeBody,
  loginBody,
  memberAcceptBody,
  memberInviteBody,
  pacienteBuscarBody,
  rol,
} from "../contracts";
import { fecha, ok, ruta } from "./tipos";

/* Rutas /clinics/v1/*: la consola de la clínica (cookie bam_clinic) y el
   software de gestión (Bearer bmk_…). */

/* ── Respuestas ──────────────────────────────────────────── */

export const registroHecho = z.object({
  clinicId: z.string().uuid(),
  memberId: z.string().uuid(),
  correo: z.string(),
  /** El dominio que queda verificado con el código, o null si el correo es gratuito. */
  dominio: z.string().nullable(),
  correoVerificado: z.literal(false),
});
export type RegistroHecho = z.infer<typeof registroHecho>;

export const correoVerificado = z.object({
  verificado: z.literal(true),
  dominio: z.string().nullable(),
  clinicaVerificada: z.boolean(),
});
export type CorreoVerificado = z.infer<typeof correoVerificado>;

export const sesionClinica = z.object({
  memberId: z.string().uuid(),
  clinicId: z.string().uuid(),
  role: rol,
});
export type SesionClinica = z.infer<typeof sesionClinica>;

export const yoClinica = z.object({
  memberId: z.string().uuid(),
  clinicId: z.string().uuid(),
  role: rol,
  clinicaActiva: z.boolean(),
  nombre: z.string(),
  correo: z.string(),
  correoVerificado: z.boolean(),
  /** La clave de la clínica sellada para este dispositivo, si otro administrador la entregó. */
  claveEnvuelta: z.string().nullable(),
  clinica: z.object({
    nombre: z.string(),
    pais: z.string(),
    dominio: z.string().nullable(),
    verificada: z.boolean(),
    direccion: z.string().nullable(),
    pubKey: z.string(),
  }),
});
export type YoClinica = z.infer<typeof yoClinica>;

export const custodia = z.enum(["codigo", "entregada", "pendiente", "sin-aceptar"]);

export const miembro = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  email: z.string(),
  rol,
  aceptado: fecha.nullable(),
  alta: fecha,
  yo: z.boolean(),
  /** Solo para administradores: cómo tiene la clave de la clínica. */
  custodia: custodia.nullable(),
  /** Para sellarle la clave: solo la ve un administrador. */
  devicePubKey: z.string().nullable(),
});
export type Miembro = z.infer<typeof miembro>;

export const borrador = z.object({
  id: z.string().uuid(),
  especie: z.string(),
  caduca: fecha,
  reclamado: z.string().uuid().nullable(),
});
export type Borrador = z.infer<typeof borrador>;

export const claveApi = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  prefijo: z.string(),
  creada: fecha,
  ultimoUso: fecha.nullable(),
  /** Clave de firma Ed25519 en base64; null en las creadas antes de las firmas. */
  firma: z.string().nullable(),
});
export type ClaveApi = z.infer<typeof claveApi>;

export const claveCreada = z.object({
  id: z.string().uuid(),
  prefijo: z.string(),
  /** Sale una vez y no se guarda. */
  token: z.string().startsWith("bmk_"),
});
export type ClaveCreada = z.infer<typeof claveCreada>;

export const envio = z.object({
  id: z.string().uuid(),
  petId: z.string().uuid(),
  chipPista: z.string().nullable(),
  /** Nombre de la clave con que se envió; null si se borró. */
  clave: z.string().nullable(),
  bytes: z.number().int(),
  fecha,
});
export type Envio = z.infer<typeof envio>;

export const paciente = z.object({
  petId: z.string().uuid(),
  /** Clave pública X25519 del dueño, en base64: a ella se sella el informe. */
  ownerPubKey: z.string(),
  chipPista: z.string().nullable(),
});
export type Paciente = z.infer<typeof paciente>;

export const informeEnviado = z.object({
  envioId: z.string().uuid(),
  fecha,
  adjuntos: z.number().int(),
});
export type InformeEnviado = z.infer<typeof informeEnviado>;

/* ── Rutas ───────────────────────────────────────────────── */

export const rutasClinicas = {
  registrarClinica: ruta({
    metodo: "POST",
    ruta: "/clinics/v1/register",
    acceso: "publica",
    resumen: "Alta de la clínica y de su primer administrador. Abre sesión y envía el código al correo.",
    cuerpo: clinicRegisterBody,
    respuesta: registroHecho,
    estado: 201,
    errores: [400, 409, 429],
  }),
  verificarCorreo: ruta({
    metodo: "POST",
    ruta: "/clinics/v1/email/verify",
    acceso: "clinica",
    resumen: "Valida el código del correo; con dominio propio, verifica también la clínica.",
    cuerpo: codigoCorreoBody,
    respuesta: correoVerificado,
    errores: [400, 401, 410, 429],
  }),
  reenviarCodigoCorreo: ruta({
    metodo: "POST",
    ruta: "/clinics/v1/email/resend",
    acceso: "clinica",
    resumen: "Envía un código nuevo al correo. Uno por minuto como mucho.",
    respuesta: z.object({ enviado: z.literal(true), correo: z.string() }),
    estado: 202,
    errores: [401, 409, 429, 502],
  }),
  entrarClinica: ruta({
    metodo: "POST",
    ruta: "/clinics/v1/login",
    acceso: "publica",
    resumen: "Entrada de un miembro con correo y contraseña. Pone la cookie de sesión.",
    cuerpo: loginBody,
    respuesta: sesionClinica,
    errores: [400, 401, 429],
  }),
  salirClinica: ruta({
    metodo: "POST",
    ruta: "/clinics/v1/logout",
    acceso: "clinica",
    resumen: "Cierra la sesión y borra la cookie.",
    respuesta: ok,
  }),
  yoClinica: ruta({
    metodo: "GET",
    ruta: "/clinics/v1/me",
    acceso: "clinica",
    resumen: "Quién está dentro y de qué clínica.",
    respuesta: yoClinica,
    errores: [401],
  }),

  /* Equipo */
  listarMiembros: ruta({
    metodo: "GET",
    ruta: "/clinics/v1/members",
    acceso: "clinica",
    resumen: "Miembros vivos de la clínica y cómo custodia cada administrador la clave.",
    respuesta: z.object({ miembros: z.array(miembro) }),
    errores: [401],
  }),
  invitarMiembro: ruta({
    metodo: "POST",
    ruta: "/clinics/v1/members",
    acceso: "clinica",
    resumen: "Un administrador invita por correo a un miembro nuevo.",
    cuerpo: memberInviteBody,
    respuesta: z.object({ memberId: z.string().uuid(), enviado: z.literal(true) }),
    estado: 201,
    errores: [400, 401, 403, 409, 429, 502],
  }),
  entregarClaveClinica: ruta({
    metodo: "POST",
    ruta: "/clinics/v1/members/:id/clinic-key",
    acceso: "clinica",
    resumen: "Entrega la clave de la clínica, sellada en el navegador, a otro administrador.",
    cuerpo: clinicKeyBody,
    respuesta: ok,
    errores: [400, 401, 403, 404, 409],
  }),
  aceptarInvitacion: ruta({
    metodo: "POST",
    ruta: "/clinics/v1/members/accept",
    acceso: "publica",
    resumen: "Acepta la invitación con el token del correo, elige contraseña y abre sesión.",
    cuerpo: memberAcceptBody,
    respuesta: sesionClinica,
    errores: [400],
  }),
  darDeBajaMiembro: ruta({
    metodo: "DELETE",
    ruta: "/clinics/v1/members/:id",
    acceso: "clinica",
    resumen: "Da de baja a un miembro: borra su envoltura de la clave y sus sesiones.",
    respuesta: z.object({ ok: z.literal(true), descargadoNoVuelve: z.literal(true) }),
    errores: [400, 401, 403, 404],
  }),

  /* Borradores */
  crearBorrador: ruta({
    metodo: "POST",
    ruta: "/clinics/v1/drafts",
    acceso: "clinica",
    resumen: "Ficha preparada sin dueño todavía, sellada con la clave de la clínica. Caduca a los 90 días.",
    cuerpo: draftCreateBody,
    respuesta: z.object({ draftId: z.string().uuid(), caduca: fecha }),
    estado: 201,
    errores: [400, 401, 403],
  }),
  listarBorradores: ruta({
    metodo: "GET",
    ruta: "/clinics/v1/drafts",
    acceso: "clinica",
    resumen: "Borradores de la clínica.",
    respuesta: z.object({ borradores: z.array(borrador), total: z.number().int() }),
    errores: [401],
  }),

  /* Software de gestión: consola */
  listarClavesApi: ruta({
    metodo: "GET",
    ruta: "/clinics/v1/api-keys",
    acceso: "clinica",
    resumen: "Claves de API vivas y su último uso. El token no sale nunca.",
    respuesta: z.object({ claves: z.array(claveApi) }),
    errores: [401],
  }),
  crearClaveApi: ruta({
    metodo: "POST",
    ruta: "/clinics/v1/api-keys",
    acceso: "clinica",
    resumen: "Un administrador crea una clave de API. El token se devuelve una sola vez.",
    cuerpo: apiKeyCreateBody,
    respuesta: claveCreada,
    estado: 201,
    errores: [400, 401, 403, 409],
  }),
  retirarClaveApi: ruta({
    metodo: "DELETE",
    ruta: "/clinics/v1/api-keys/:id",
    acceso: "clinica",
    resumen: "Retira una clave: deja de valer al momento.",
    respuesta: ok,
    errores: [401, 403, 404],
  }),
  listarEnvios: ruta({
    metodo: "GET",
    ruta: "/clinics/v1/reports",
    acceso: "clinica",
    resumen: "Los últimos 50 envíos: fecha, mascota y clave. Nunca el contenido.",
    respuesta: z.object({ envios: z.array(envio) }),
    errores: [401],
  }),

  /* Software de gestión: con clave de API */
  yoClaveApi: ruta({
    metodo: "GET",
    ruta: "/clinics/v1/api/me",
    acceso: "clave-api",
    resumen: "Comprueba la clave: su nombre y la clínica.",
    respuesta: z.object({
      clave: z.string(),
      clinica: z.object({ nombre: z.string(), dominio: z.string().nullable(), verificada: z.boolean() }),
    }),
    errores: [401],
  }),
  listarPacientes: ruta({
    metodo: "GET",
    ruta: "/clinics/v1/api/patients",
    acceso: "clave-api",
    resumen: "Pacientes con nivel 3 vivo y la clave pública de su dueño.",
    respuesta: z.object({ pacientes: z.array(paciente.extend({ desde: fecha })) }),
    errores: [401],
  }),
  buscarPaciente: ruta({
    metodo: "POST",
    ruta: "/clinics/v1/api/patients/search",
    acceso: "clave-api",
    resumen: "El paciente de un chip, solo si dio el nivel 3 a esta clínica. Si no, 404 sin decir por qué.",
    cuerpo: pacienteBuscarBody,
    respuesta: paciente,
    errores: [400, 401, 404],
  }),
  enviarInforme: ruta({
    metodo: "POST",
    ruta: "/clinics/v1/reports",
    acceso: "clave-api",
    resumen: "Informe firmado y sellado para el dueño, con hasta tres PDF sellados aparte.",
    cuerpo: informeBody,
    respuesta: informeEnviado,
    estado: 201,
    errores: [400, 401, 404, 413, 503],
  }),
} as const;
