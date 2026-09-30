import { z } from "zod";
import {
  base64,
  claveRecuperacionBody,
  codigoCorreoBody,
  dispositivoBody,
  dispositivoRetirarBody,
  ownerLoginBody,
  ownerPetBody,
  ownerRegisterBody,
  perfilBody,
  recuperacionFinBody,
  recuperacionInicioBody,
  recuperacionPruebaBody,
  reenvioBody,
  segundoFactor,
  segundoFactorBody,
  telefonoBody,
} from "../contracts";
import { compartirBody, pasaporteBody } from "../pasaporte";
import { fecha, ok, ruta } from "./tipos";

/* Portal del dueño (/mi-mascota) y app móvil: las rutas /owners/v1/*.
   Servidor: apps/api/src/routes/duenos.ts y pasaporte.ts. */

/** Por dónde salió el código de entrada y, para la app, el token pendiente. */
export const envioCodigo = z.object({
  enviado: z.literal(true),
  canal: segundoFactor,
  /** Destino enmascarado: correo o teléfono, según `canal`. */
  correo: z.string(),
  /** Si hay otro canal al que pedir el código. */
  otroCanal: segundoFactor.nullable(),
  /** Solo con `x-bm-cliente: app`: la sesión pendiente, que abre el paso del código. */
  token: z.string().optional(),
});
export type EnvioCodigo = z.infer<typeof envioCodigo>;

export const activacion = z.object({
  /** Se muestra una vez: el servidor solo guarda su hash. */
  codigoActivacion: z.string(),
  caduca: fecha,
});
export type Activacion = z.infer<typeof activacion>;

export const mascotaNueva = activacion.extend({ petId: z.string().uuid() });

export const estadoMascota = z.enum(["pendiente", "activa", "congelada", "retirada"]);
export type EstadoMascota = z.infer<typeof estadoMascota>;

export const telefonoPerfil = z.object({ etiqueta: z.string(), numero: z.string() });
export type Telefono = z.infer<typeof telefonoPerfil>;

export const mascota = z.object({
  petId: z.string().uuid(),
  estado: estadoMascota,
  /** Últimas cuatro cifras del chip, para reconocerlo. */
  chipPista: z.string().nullable(),
  activada: fecha.nullable(),
  /** Mensajes esperando en la bandeja. Solo el número: el contenido va sellado. */
  mensajes: z.number().int().nonnegative(),
  perfil: z.object({
    nombre: z.string(),
    bio: z.string(),
    telefonos: z.array(telefonoPerfil),
    publicado: z.boolean(),
    /** Ruta relativa a la API (privada del dueño), o null. */
    foto: z.string().nullable(),
  }),
  reclamacion: z
    .object({
      id: z.string().uuid(),
      plazo: fecha,
      estado: z.enum(["abierta", "impugnada"]),
      /** titular: han reclamado su chip. reclamante: reclama el de otro. */
      rol: z.enum(["titular", "reclamante"]),
    })
    .nullable(),
});
export type Mascota = z.infer<typeof mascota>;

export const yo = z.object({
  correo: z.string(),
  pubKey: base64,
  /** Si ya guardó la clave de recuperación del papel. */
  recuperacion: z.boolean(),
  /** Por dónde llega el código de entrada. */
  segundoFactor,
  /** El teléfono del segundo factor, enmascarado. */
  telefono: z.object({ numero: z.string(), verificado: z.boolean() }).nullable(),
  mascotas: z.array(mascota),
});
export type Yo = z.infer<typeof yo>;

/** Quién envió un informe, según la clave de API con que llegó. Lo pone el
    servidor, no la clínica; en notas y avisos es null. */
export const origen = z.object({
  clinica: z.string(),
  pais: z.string(),
  /** Solo si la clínica verificó su dominio. */
  dominio: z.string().nullable(),
  /** Clave de firma de la conexión que lo envió (base64), si la tiene. */
  firma: base64.nullable(),
});
export type Origen = z.infer<typeof origen>;

/** PDF adjunto a un informe: sellado aparte, se descarga y se abre en el cliente. */
export const adjuntoSellado = z.object({
  id: z.string().uuid(),
  orden: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
});
export type AdjuntoSellado = z.infer<typeof adjuntoSellado>;

/** Mensaje de la bandeja tal como llega: sellado a la clave pública del dueño. */
export const mensajeSellado = z.object({
  id: z.string().uuid(),
  petId: z.string().uuid(),
  sellado: base64,
  llegada: fecha,
  adjuntos: z.array(adjuntoSellado),
  origen: origen.nullable(),
});
export type MensajeSellado = z.infer<typeof mensajeSellado>;

export const enlace = z.object({ id: z.string().uuid(), caduca: fecha, creado: fecha });
export type Enlace = z.infer<typeof enlace>;

const conFactor = (canal: "correo" | "sms" | null) =>
  z.object({ ok: z.literal(true), segundoFactor: canal ? z.literal(canal) : segundoFactor });

export const rutasDuenos = {
  /* ── Cuenta y entrada ─────────────────────────────────────── */

  darDeAlta: ruta({
    metodo: "POST",
    ruta: "/owners/v1/register",
    acceso: "publica",
    resumen: "Alta: cuenta, primera mascota pendiente y código de entrada al correo.",
    cuerpo: ownerRegisterBody,
    estado: 201,
    respuesta: z.object({
      /** Solo con `x-bm-cliente: app`, y si el código salió. */
      token: z.string().optional(),
      correo: z.string(),
      mascota: mascotaNueva,
    }),
    errores: [400, 409],
  }),

  entrar: ruta({
    metodo: "POST",
    ruta: "/owners/v1/login",
    acceso: "publica",
    resumen: "Entrar, primer paso: chip y contraseña. Envía el código de entrada.",
    cuerpo: ownerLoginBody,
    respuesta: envioCodigo,
    errores: [400, 401, 502],
  }),

  confirmarCodigo: ruta({
    metodo: "POST",
    ruta: "/owners/v1/login/verify",
    acceso: "dueno-pendiente",
    resumen: "Entrar, segundo paso (y confirmación del alta): el código del correo o del SMS.",
    cuerpo: codigoCorreoBody,
    respuesta: z.object({
      ok: z.literal(true),
      /** Solo con `x-bm-cliente: app`: la sesión abierta, para `Authorization: Bearer`. */
      token: z.string().optional(),
    }),
    errores: [400, 410, 429],
  }),

  reenviarCodigo: ruta({
    metodo: "POST",
    ruta: "/owners/v1/login/resend",
    acceso: "dueno-pendiente",
    resumen: "Otro código para la sesión pendiente, uno por minuto, por el canal pedido.",
    cuerpo: reenvioBody,
    estado: 202,
    respuesta: envioCodigo,
    errores: [400, 410, 429, 502],
  }),

  salir: ruta({
    metodo: "POST",
    ruta: "/owners/v1/logout",
    acceso: "dueno",
    resumen: "Cierra la sesión. No falla si ya no había.",
    respuesta: ok,
  }),

  yo: ruta({
    metodo: "GET",
    ruta: "/owners/v1/me",
    acceso: "dueno",
    resumen: "El dueño: sus mascotas, su perfil público, sus reclamaciones y su segundo factor.",
    respuesta: yo,
    errores: [401],
  }),

  /* ── Mascotas ─────────────────────────────────────────────── */

  nuevaMascota: ruta({
    metodo: "POST",
    ruta: "/owners/v1/pets",
    acceso: "dueno",
    resumen: "Otra mascota en la misma cuenta. Queda pendiente hasta que la active una clínica.",
    cuerpo: ownerPetBody,
    estado: 201,
    respuesta: mascotaNueva,
    errores: [400, 401],
  }),

  nuevoCodigoActivacion: ruta({
    metodo: "POST",
    ruta: "/owners/v1/pets/:id/activation-code",
    acceso: "dueno",
    resumen: "Nuevo código de activación: se muestra una vez y el anterior deja de valer.",
    respuesta: activacion,
    errores: [401, 404, 409],
  }),

  guardarPerfil: ruta({
    metodo: "PUT",
    ruta: "/owners/v1/pets/:id/profile",
    acceso: "dueno",
    resumen: "Perfil público: lo que ve quien encuentre al animal, si el dueño lo publica.",
    cuerpo: perfilBody,
    respuesta: ok,
    errores: [400, 401, 404],
  }),

  subirFoto: ruta({
    metodo: "PUT",
    ruta: "/owners/v1/pets/:id/photo",
    acceso: "dueno",
    resumen: "Foto del perfil: JPEG, PNG o WebP de hasta 2 MB. Cada foto nueva tiene URL nueva.",
    cuerpoBinario: ["image/jpeg", "image/png", "image/webp"],
    respuesta: z.object({ foto: z.string() }),
    errores: [401, 404, 413, 415, 503],
  }),

  leerFoto: ruta({
    metodo: "GET",
    ruta: "/owners/v1/pets/:id/photo",
    acceso: "dueno",
    resumen: "La foto vista por su dueño, esté o no publicada.",
    respuestaBinaria: "image/*",
    errores: [401, 404],
  }),

  quitarFoto: ruta({
    metodo: "DELETE",
    ruta: "/owners/v1/pets/:id/photo",
    acceso: "dueno",
    resumen: "Quita la foto del perfil.",
    respuesta: ok,
    errores: [401, 404],
  }),

  /* ── Segundo factor por SMS ───────────────────────────────── */

  ponerTelefono: ruta({
    metodo: "PUT",
    ruta: "/owners/v1/phone",
    acceso: "dueno",
    resumen: "Poner o cambiar el teléfono: llega un código por SMS; no cuenta hasta confirmarlo.",
    cuerpo: telefonoBody,
    estado: 202,
    respuesta: z.object({ enviado: z.literal(true), telefono: z.string() }),
    errores: [400, 401, 429, 502],
  }),

  confirmarTelefono: ruta({
    metodo: "POST",
    ruta: "/owners/v1/phone/verify",
    acceso: "dueno",
    resumen: "Confirmar el teléfono con el código del SMS. Desde ese momento, el SMS es el canal.",
    cuerpo: codigoCorreoBody,
    respuesta: conFactor("sms"),
    errores: [400, 401, 410, 429],
  }),

  quitarTelefono: ruta({
    metodo: "DELETE",
    ruta: "/owners/v1/phone",
    acceso: "dueno",
    resumen: "Quitar el teléfono: el código vuelve a llegar por correo.",
    respuesta: conFactor("correo"),
    errores: [401],
  }),

  elegirSegundoFactor: ruta({
    metodo: "PUT",
    ruta: "/owners/v1/second-factor",
    acceso: "dueno",
    resumen: "Elegir el canal del código de entrada. «sms» exige el teléfono confirmado.",
    cuerpo: segundoFactorBody,
    respuesta: conFactor(null),
    errores: [400, 401, 409],
  }),

  /* ── Avisos push de la app ────────────────────────────────── */

  registrarDispositivo: ruta({
    metodo: "POST",
    ruta: "/owners/v1/devices",
    acceso: "dueno",
    resumen: "Registrar el token push del móvil. Si era de otra cuenta, pasa a esta.",
    cuerpo: dispositivoBody,
    estado: 201,
    respuesta: ok,
    errores: [400, 401],
  }),

  retirarDispositivo: ruta({
    metodo: "DELETE",
    ruta: "/owners/v1/devices",
    acceso: "dueno",
    resumen: "Dejar de recibir avisos en este móvil.",
    cuerpo: dispositivoRetirarBody,
    respuesta: ok,
    errores: [400, 401],
  }),

  /* ── Reclamaciones de chip ────────────────────────────────── */

  impugnar: ruta({
    metodo: "POST",
    ruta: "/owners/v1/claims/:id/contest",
    acceso: "dueno",
    resumen: "Impugnar una reclamación sobre mi chip: detiene el traspaso y pasa a revisión a mano.",
    respuesta: z.object({ estado: z.literal("impugnada") }),
    errores: [401, 404, 409],
  }),

  /* ── Bandeja ──────────────────────────────────────────────── */

  leerBandeja: ruta({
    metodo: "GET",
    ruta: "/owners/v1/inbox",
    acceso: "dueno",
    resumen: "Notas, avisos e informes sellados a la clave pública del dueño.",
    respuesta: z.object({ mensajes: z.array(mensajeSellado) }),
    errores: [401],
  }),

  borrarMensaje: ruta({
    metodo: "DELETE",
    ruta: "/owners/v1/inbox/:id",
    acceso: "dueno",
    resumen: "Borrar un mensaje y sus adjuntos. No hay papelera.",
    respuesta: ok,
    errores: [401, 404],
  }),

  descargarAdjunto: ruta({
    metodo: "GET",
    ruta: "/owners/v1/inbox/:id/attachments/:adjuntoId",
    acceso: "dueno",
    resumen: "Un PDF adjunto, sellado. Se abre en el navegador o el móvil del dueño.",
    respuestaBinaria: "application/octet-stream",
    errores: [401, 404, 503],
  }),

  /* ── Pasaporte de viaje ───────────────────────────────────── */

  leerPasaporte: ruta({
    metodo: "GET",
    ruta: "/owners/v1/pets/:id/passport",
    acceso: "dueno",
    resumen: "El pasaporte cifrado, o null si aún no hay (versión 0).",
    respuesta: z.object({ sobre: base64.nullable(), version: z.number().int().nonnegative() }),
    errores: [401, 404],
  }),

  guardarPasaporte: ruta({
    metodo: "PUT",
    ruta: "/owners/v1/pets/:id/passport",
    acceso: "dueno",
    resumen: "Guarda el pasaporte. `version` es la leída: si otro la cambió entre medias, 409.",
    cuerpo: pasaporteBody,
    respuesta: z.object({ version: z.number().int().positive() }),
    errores: [400, 401, 404, 409],
  }),

  listarEnlaces: ruta({
    metodo: "GET",
    ruta: "/owners/v1/pets/:id/shares",
    acceso: "dueno",
    resumen: "Enlaces de viaje vivos de una mascota.",
    respuesta: z.object({ enlaces: z.array(enlace) }),
    errores: [401, 404],
  }),

  crearEnlace: ruta({
    metodo: "POST",
    ruta: "/owners/v1/pets/:id/shares",
    acceso: "dueno",
    resumen: "Nuevo enlace temporal. El id lo elige el navegador: el cifrado va atado a él.",
    cuerpo: compartirBody,
    estado: 201,
    respuesta: z.object({ id: z.string().uuid(), caduca: fecha }),
    errores: [400, 401, 404, 409],
  }),

  retirarEnlace: ruta({
    metodo: "DELETE",
    ruta: "/owners/v1/pets/:id/shares/:shareId",
    acceso: "dueno",
    resumen: "Retirar un enlace borra el bloque: deja de abrirse al momento.",
    respuesta: z.object({ ok: z.literal(true), descargadoNoVuelve: z.literal(true) }),
    errores: [401, 404],
  }),

  /* ── Recuperar la contraseña: papel y segundo factor ─────── */

  empezarRecuperacion: ruta({
    metodo: "POST",
    ruta: "/owners/v1/recovery",
    acceso: "publica",
    resumen:
      "Paso 1: el chip. Devuelve un reto para firmar con la clave del código en papel, haya cuenta o no.",
    cuerpo: recuperacionInicioBody,
    respuesta: z.object({ recuperacionId: z.string().uuid(), reto: z.string(), caduca: fecha }),
    estado: 201,
    errores: [400, 429],
  }),

  probarPapel: ruta({
    metodo: "POST",
    ruta: "/owners/v1/recovery/proof",
    acceso: "publica",
    resumen:
      "Paso 2: el reto firmado (Ed25519) con la clave de recuperación del papel. Si vale, sale un código por el segundo factor.",
    cuerpo: recuperacionPruebaBody,
    respuesta: z.object({ enviado: z.literal(true), canal: segundoFactor, destino: z.string() }),
    errores: [400, 401, 410, 429, 502],
  }),

  terminarRecuperacion: ruta({
    metodo: "POST",
    ruta: "/owners/v1/recovery/finish",
    acceso: "publica",
    resumen: "Paso 3: el código y la contraseña nueva. Cierra todas las sesiones y avisa por correo.",
    cuerpo: recuperacionFinBody,
    respuesta: ok,
    errores: [400, 410, 429],
  }),

  guardarClaveRecuperacion: ruta({
    metodo: "PUT",
    ruta: "/owners/v1/recovery-key",
    acceso: "dueno",
    resumen: "Cuentas de antes de la recuperación: guardar una vez la clave pública de recuperación.",
    cuerpo: claveRecuperacionBody,
    respuesta: ok,
    errores: [400, 401, 409],
  }),
} as const;
