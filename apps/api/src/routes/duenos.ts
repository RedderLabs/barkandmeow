import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, count, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import {
  blobs,
  clinicApiKeys,
  clinics,
  drafts,
  inbox,
  inboxAdjuntos,
  ownerDevices,
  owners,
  ownerSessions,
  petIdentifiers,
  petProfiles,
  pets,
  reclamaciones,
  recuperaciones,
} from "@barkandmeow/db";
import {
  bandejaBorrarBody,
  codigoCorreoBody,
  contrasenaCambioBody,
  cuentaBorrarBody,
  dispositivoBody,
  dispositivoRetirarBody,
  normalizarChip,
  ownerLoginBody,
  ownerPetBody,
  ownerRegisterBody,
  perfilBody,
  reenvioBody,
  segundoFactorBody,
  telefonoBody,
} from "@barkandmeow/schema";
import {
  db,
  enviarCorreo,
  env,
  gastarPresupuesto,
  hashCodigoCorreo,
  hashPassword,
  hashToken,
  indexar,
  mismoHash,
  normalizarCodigoCorreo,
  nuevoCodigoCorreo,
  nuevoToken,
  verificarPassword,
} from "../core.js";
import { purgarSinVerificar } from "../limpieza.js";
import { nuevoCodigoActivacion, registrarPendiente } from "./mascotas.js";
import { almacenActual, bytesDeFoto, claves } from "../almacen.js";
import { avisarPush } from "../push.js";
import { enmascararTelefono, enviarSms, normalizarTelefono } from "../sms.js";

/* Portal del dueño (decidido 2026-09-27).

   Entrar exige tres cosas: el número de chip (identifica, no autoriza), la
   contraseña que eligió el dueño y un código que le llega por correo. El alta
   pasa por el mismo código, así que una cuenta nunca queda abierta con un
   correo sin confirmar.

   Lo que el servidor no hace: leer ni editar datos clínicos. La ficha está
   cifrada con las claves del dueño; la contraseña solo le identifica ante el
   servidor. El portal gestiona lo que es público o de trámite: el perfil
   para quien encuentre al animal, el código de activación y las
   reclamaciones sobre su chip. La bandeja (notas y avisos) sale sellada y se
   abre en el navegador del dueño, con la clave de su código en papel.

   El código de entrada llega por correo o, si el dueño confirmó un teléfono y
   lo eligió, por SMS (decidido 2026-09-30). La app móvil usa las mismas rutas:
   con la cabecera `x-bm-cliente: app` recibe el token en la respuesta y lo
   manda como `Authorization: Bearer`, en vez de cookie. */

const COOKIE = "bam_owner";
const PENDIENTE_MS = 15 * 60 * 1000;
const SESION_DIAS = 30;
const INTENTOS = 5;
const REENVIO_MS = 60 * 1000;
const FOTO_MAX = 2 * 1024 * 1024;
const BANDEJA_MAX = 200;
const SMS_DIA = Number(process.env.LIMITE_SMS_DIA ?? 8);
const DISPOSITIVOS_MAX = 10;

type Dueno = { ownerId: string; sessionId: string };

export const enmascarar = (email: string) => {
  const [u, d] = email.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
};

function ponerCookie(reply: FastifyReply, token: string, dias: number) {
  reply.setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: dias * 86400,
  });
}

/** La app móvil no guarda cookies: pide el token en el cuerpo de la respuesta. */
const esApp = (req: FastifyRequest) => req.headers["x-bm-cliente"] === "app";

/** El token de sesión: el de la cookie del portal o el Bearer de la app. */
function tokenDe(req: FastifyRequest): string | null {
  const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? "");
  return bearer?.[1] ?? req.cookies?.[COOKIE] ?? null;
}

async function sesionDe(req: FastifyRequest, estado: "pendiente" | "abierta") {
  const token = tokenDe(req);
  if (!token) return null;
  const [s] = await db
    .select()
    .from(ownerSessions)
    .where(eq(ownerSessions.tokenHash, hashToken(token)))
    .limit(1);
  if (!s || s.estado !== estado || s.expiresAt < new Date()) return null;
  return s;
}

/** El id del dueño con sesión abierta, para el límite por cuenta. No responde nada. */
export const idDeDueno = async (req: FastifyRequest) => (await sesionDe(req, "abierta"))?.ownerId ?? null;

/** El dueño con sesión abierta (contraseña y código del correo), o 401. */
export async function duenoDe(req: FastifyRequest, reply: FastifyReply): Promise<Dueno | null> {
  const s = await sesionDe(req, "abierta");
  if (!s) {
    reply.code(401).send({ error: "sin sesión" });
    return null;
  }
  return { ownerId: s.ownerId, sessionId: s.id };
}

export type Destinatario = {
  id: string;
  email: string;
  telefono: string | null;
  telefonoVerificadoAt: Date | null;
  segundoFactor: "correo" | "sms";
};
type Canal = "correo" | "sms";

export const destinatario = {
  id: owners.id,
  email: owners.email,
  telefono: owners.telefono,
  telefonoVerificadoAt: owners.telefonoVerificadoAt,
  segundoFactor: owners.segundoFactor,
};

/** El canal que toca: el que eligió el dueño, si sigue siendo posible. */
export function canalDe(o: Destinatario, pedido?: Canal): Canal {
  const smsListo = !!o.telefono && !!o.telefonoVerificadoAt;
  const c = pedido ?? o.segundoFactor;
  return c === "sms" && smsListo ? "sms" : "correo";
}

/**
 * Reserva un SMS del cupo diario del dueño, en una sola sentencia: con
 * peticiones en paralelo nadie pasa del tope. false si ya lo agotó hoy.
 */
async function reservarSms(ownerId: string): Promise<boolean> {
  const hoy = new Date().toISOString().slice(0, 10);
  const r = await db
    .update(owners)
    .set({
      smsDia: hoy,
      smsEnviados: sql`case when ${owners.smsDia} = ${hoy} then ${owners.smsEnviados} + 1 else 1 end`,
      smsUltimo: new Date(),
    })
    .where(and(eq(owners.id, ownerId), sql`(${owners.smsDia} is distinct from ${hoy} or ${owners.smsEnviados} < ${SMS_DIA})`))
    .returning({ id: owners.id });
  return r.length > 0;
}

export class SinCupoSms extends Error {}

/** Envía el código por el canal elegido. */
export async function enviarCodigo(o: Destinatario, canal: Canal, codigo: string, asunto: string) {
  const legible = `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
  if (canal === "sms") {
    if (!(await reservarSms(o.id))) throw new SinCupoSms();
    // Sin enlaces ni nombre: un SMS con enlace es el formato del phishing.
    await enviarSms({ para: o.telefono!, texto: `Bark & Meow: tu código es ${legible}. Caduca en 15 minutos. No lo compartas con nadie.` });
    return;
  }
  await enviarCorreo({
    para: o.email,
    asunto: `${legible} es tu código de Bark & Meow`,
    texto: [
      asunto,
      "",
      `    ${legible}`,
      "",
      "Caduca en 15 minutos. Si no has sido tú, ignora este correo: sin el código",
      "nadie puede entrar, aunque sepa el número de chip y tu contraseña.",
    ].join("\n"),
  });
}

export const destinoDe = (o: Destinatario, canal: Canal) =>
  canal === "sms" ? enmascararTelefono(o.telefono!) : enmascarar(o.email);

/**
 * Abre una sesión pendiente y envía el código de entrada. Devuelve por dónde
 * salió y, para la app, el token pendiente.
 */
async function sesionPendiente(
  req: FastifyRequest,
  reply: FastifyReply,
  owner: Destinatario,
  asunto: string,
  pedido?: Canal,
) {
  const { token, hash } = nuevoToken();
  const codigo = nuevoCodigoCorreo();
  const id = randomUUID();
  const canal = canalDe(owner, pedido);
  // Primero el envío: si falla, no queda una sesión pendiente huérfana.
  await enviarCodigo(owner, canal, codigo, asunto);
  await db.insert(ownerSessions).values({
    id,
    ownerId: owner.id,
    tokenHash: hash,
    estado: "pendiente",
    codeHash: hashCodigoCorreo(id, codigo),
    expiresAt: new Date(Date.now() + PENDIENTE_MS),
  });
  await db.update(owners).set({ emailCodeSentAt: new Date() }).where(eq(owners.id, owner.id));
  if (!esApp(req)) ponerCookie(reply, token, 1);
  return {
    canal,
    correo: destinoDe(owner, canal),
    /** Si hay otro canal al que pedir el código. */
    otroCanal: canal === "sms" ? ("correo" as const) : owner.telefonoVerificadoAt ? ("sms" as const) : null,
    ...(esApp(req) ? { token } : {}),
  };
}

/** La mascota, si es de este dueño. */
export async function mascotaDe(d: Dueno, petId: string, reply: FastifyReply) {
  if (!/^[0-9a-f-]{36}$/.test(petId)) {
    reply.code(404).send({ error: "no encontrada" });
    return null;
  }
  const [p] = await db
    .select()
    .from(pets)
    // Una retirada perdió el chip en una reclamación: ya no es suya para editar.
    .where(and(eq(pets.id, petId), eq(pets.ownerId, d.ownerId), ne(pets.estado, "retirada")))
    .limit(1);
  if (!p) {
    reply.code(404).send({ error: "no encontrada" });
    return null;
  }
  return p;
}

async function fotoGuardada(petId: string) {
  const [f] = await db
    .select({ fotoKey: petProfiles.fotoKey })
    .from(petProfiles)
    .where(eq(petProfiles.petId, petId))
    .limit(1);
  return f?.fotoKey ?? null;
}

/** Borra del almacén la foto que ya no se usa. Si falla, queda huérfana, no rota. */
async function soltarFoto(fotoKey: string | null, req: FastifyRequest) {
  if (!fotoKey) return;
  try {
    await almacenActual().borrar(fotoKey);
  } catch (e) {
    req.log.warn({ err: e, fotoKey }, "no se pudo borrar la foto anterior del almacén");
  }
}

/** Comprueba por la firma de los primeros bytes que es una imagen de verdad. */
function tipoDeImagen(b: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP")
    return "image/webp";
  return null;
}

/** Borra mensajes de la bandeja (ya comprobados) y sus adjuntos. No hay papelera. */
async function borrarDeLaBandeja(ids: string[], log: FastifyBaseLogger) {
  if (!ids.length) return;
  const guardados = await db.select({ s3Key: inboxAdjuntos.s3Key }).from(inboxAdjuntos).where(inArray(inboxAdjuntos.inboxId, ids));
  await db.delete(inbox).where(inArray(inbox.id, ids));
  // Si el almacén falla, el objeto queda huérfano pero sellado: nadie más lo abre.
  for (const a of guardados)
    await almacenActual()
      .borrar(a.s3Key)
      .catch((e) => log.warn({ err: (e as Error).message }, "no se pudo borrar un adjunto del almacén"));
}

export default async function rutasDuenos(app: FastifyInstance) {
  for (const tipo of ["image/jpeg", "image/png", "image/webp"])
    app.addContentTypeParser(tipo, { parseAs: "buffer", bodyLimit: FOTO_MAX }, (_req, body, hecho) =>
      hecho(null, body),
    );

  /** Alta: cuenta, primera mascota (pendiente) y código de entrada al correo. */
  app.post("/owners/v1/register", async (req, reply) => {
    const cuerpo = ownerRegisterBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const b = cuerpo.data;
    const email = b.email.trim().toLowerCase();

    await purgarSinVerificar();
    const [ya] = await db.select({ id: owners.id }).from(owners).where(eq(owners.email, email)).limit(1);
    if (ya) return reply.code(409).send({ error: "correo ya usado", motivo: "correo-usado" });

    const pubKey = Buffer.from(b.pubKey, "base64");
    const [owner] = await db
      .insert(owners)
      .values({
        email,
        passwordHash: await hashPassword(b.password),
        pubKey,
        recoveryPub: b.recuperacionPub ? Buffer.from(b.recuperacionPub, "base64") : null,
      })
      .returning(destinatario);
    const mascota = await registrarPendiente({
      identificador: b.mascota.identificador,
      ownerPubKey: pubKey,
      ownerId: owner.id,
    });
    await db.insert(petProfiles).values({ petId: mascota.petId, nombre: b.mascota.nombre.trim() });

    let pendiente: Awaited<ReturnType<typeof sesionPendiente>> | null = null;
    try {
      pendiente = await sesionPendiente(req, reply, owner, "Este es el código para confirmar tu cuenta de Bark & Meow:");
    } catch {
      req.log.warn("no se pudo enviar el código del alta");
    }
    return reply.code(201).send({
      ...(pendiente?.token ? { token: pendiente.token } : {}),
      correo: enmascarar(owner.email),
      mascota: { petId: mascota.petId, codigoActivacion: mascota.codigoActivacion, caduca: mascota.caduca },
    });
  });

  /**
   * Entrar, primer paso: chip y contraseña. Si cuadran, llega un código al
   * correo. La respuesta y el tiempo son iguales si no cuadran, para no
   * confirmar qué chips tienen cuenta.
   */
  app.post("/owners/v1/login", async (req, reply) => {
    const t0 = Date.now();
    const cuerpo = ownerLoginBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const [idx] = await indexar([normalizarChip(cuerpo.data.identificador.valor)]);
    /* Cualquiera puede dar de alta pendientes con el mismo chip, así que las
       cuentas candidatas se acotan: cada una cuesta un scrypt. Primero las de
       correo verificado y mascota activa, que son las del dueño real. */
    const candidatos = await db
      .select({ ...destinatario, hash: owners.passwordHash })
      .from(petIdentifiers)
      .innerJoin(pets, eq(pets.id, petIdentifiers.petId))
      .innerJoin(owners, eq(owners.id, pets.ownerId))
      .where(and(eq(petIdentifiers.idIndex, idx), ne(pets.estado, "retirada")))
      .orderBy(sql`${owners.emailVerifiedAt} is null`, sql`${pets.estado} <> 'activa'`)
      .limit(5);

    let owner: Destinatario | null = null;
    for (const c of candidatos)
      if (await verificarPassword(cuerpo.data.password, c.hash)) {
        owner = c;
        break;
      }
    // Presupuesto fijo: con o sin cuenta, la respuesta tarda lo mismo.
    await gastarPresupuesto(t0, 600);
    if (!owner) return reply.code(401).send({ error: "chip o contraseña incorrectos" });

    try {
      return { enviado: true, ...(await sesionPendiente(req, reply, owner, "Este es el código para entrar en Bark & Meow:")) };
    } catch (e) {
      if (e instanceof SinCupoSms)
        return { enviado: true, ...(await sesionPendiente(req, reply, owner, "Este es el código para entrar en Bark & Meow:", "correo")) };
      return reply.code(502).send({ error: "no se pudo enviar el código", motivo: "envio" });
    }
  });

  /** Entrar, segundo paso (y confirmación del alta): el código del correo o del SMS. */
  app.post("/owners/v1/login/verify", async (req, reply) => {
    const cuerpo = codigoCorreoBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const s = await sesionDe(req, "pendiente");
    if (!s || !s.codeHash) return reply.code(410).send({ error: "caducado", motivo: "caducado" });
    // El intento se reserva antes de comparar, en una sola sentencia.
    const [reserva] = await db
      .update(ownerSessions)
      .set({ codeAttempts: sql`${ownerSessions.codeAttempts} + 1` })
      .where(and(eq(ownerSessions.id, s.id), lt(ownerSessions.codeAttempts, INTENTOS)))
      .returning({ intentos: ownerSessions.codeAttempts });
    if (!reserva)
      return reply.code(429).send({ error: "demasiados intentos", motivo: "demasiados-intentos" });

    if (!mismoHash(hashCodigoCorreo(s.id, normalizarCodigoCorreo(cuerpo.data.codigo)), s.codeHash)) {
      const intentos = reserva.intentos;
      return reply.code(400).send({
        error: "código incorrecto",
        motivo: "incorrecto",
        intentosRestantes: Math.max(0, INTENTOS - intentos),
      });
    }

    // La sesión pendiente se cierra y nace otra abierta con otro token.
    const { token, hash } = nuevoToken();
    await db.delete(ownerSessions).where(eq(ownerSessions.id, s.id));
    await db.insert(ownerSessions).values({
      ownerId: s.ownerId,
      tokenHash: hash,
      estado: "abierta",
      expiresAt: new Date(Date.now() + SESION_DIAS * 864e5),
    });
    await db
      .update(owners)
      .set({ emailVerifiedAt: new Date() })
      .where(and(eq(owners.id, s.ownerId)));
    if (esApp(req)) return { ok: true, token };
    ponerCookie(reply, token, SESION_DIAS);
    return { ok: true };
  });

  /**
   * Otro código para la sesión pendiente, uno por minuto. `canal` lo pide por
   * el otro camino: el correo si el móvil no está a mano, o el SMS.
   */
  app.post("/owners/v1/login/resend", async (req, reply) => {
    const cuerpo = reenvioBody.safeParse(req.body ?? {});
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const s = await sesionDe(req, "pendiente");
    if (!s) return reply.code(410).send({ error: "caducado", motivo: "caducado" });
    const [o] = await db.select({ ...destinatario, enviado: owners.emailCodeSentAt }).from(owners).where(eq(owners.id, s.ownerId));
    const espera = o.enviado ? o.enviado.getTime() + REENVIO_MS - Date.now() : 0;
    if (espera > 0) return reply.code(429).send({ error: "espera antes de pedir otro código", motivo: "espera", segundos: Math.ceil(espera / 1000) });

    let r: Awaited<ReturnType<typeof sesionPendiente>>;
    try {
      r = await sesionPendiente(req, reply, o, "Este es tu nuevo código de Bark & Meow:", cuerpo.data.canal);
    } catch (e) {
      if (e instanceof SinCupoSms)
        return reply.code(429).send({ error: "límite diario de SMS", motivo: "sin-cupo-sms" });
      return reply.code(502).send({ error: "no se pudo enviar el código", motivo: "envio" });
    }
    // La pendiente anterior deja de valer: solo cuenta el último código.
    await db.delete(ownerSessions).where(eq(ownerSessions.id, s.id));
    return reply.code(202).send({ enviado: true, ...r });
  });

  app.post("/owners/v1/logout", async (req, reply) => {
    const token = tokenDe(req);
    if (token) await db.delete(ownerSessions).where(eq(ownerSessions.tokenHash, hashToken(token)));
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  /* Las dos piden la contraseña actual aunque la sesión esté abierta: con
     un móvil desbloqueado en mano no basta para cambiarla ni para borrarlo
     todo. Pocos intentos, para que no sirvan de oráculo de contraseñas. */
  const comprobarContrasena = { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } };

  /** Cambiar la contraseña. Las demás sesiones se cierran; esta sigue. */
  app.post("/owners/v1/password", comprobarContrasena, async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const cuerpo = contrasenaCambioBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const [o] = await db.select().from(owners).where(eq(owners.id, d.ownerId));
    if (!o || !(await verificarPassword(cuerpo.data.actual, o.passwordHash)))
      return reply.code(403).send({ error: "contraseña incorrecta" });

    await db.update(owners).set({ passwordHash: await hashPassword(cuerpo.data.nueva) }).where(eq(owners.id, o.id));
    await db.delete(ownerSessions).where(and(eq(ownerSessions.ownerId, o.id), ne(ownerSessions.id, d.sessionId)));
    await enviarCorreo({
      para: o.email,
      asunto: "Has cambiado tu contraseña de Bark & Meow",
      texto: [
        "La contraseña de tu cuenta de Bark & Meow acaba de cambiar, y se han cerrado las",
        "sesiones abiertas en otros navegadores y móviles.",
        "",
        "Si no has sido tú, recupera la cuenta con tu código en papel:",
        "",
        `    ${env.portalWebUrl}/recuperar`,
      ].join("\n"),
    }).catch((e) => req.log.warn({ err: (e as Error).message }, "no se pudo avisar del cambio de contraseña"));
    return { ok: true };
  });

  /**
   * Borrar la cuenta para siempre. Se van sus mascotas y todo lo que cuelga
   * de ellas (identificadores, perfil, ficha, placa, pasaporte, bandeja,
   * permisos, etiquetas de las clínicas), sus sesiones y sus móviles. Los
   * chips quedan libres para registrarse de nuevo. No hay papelera.
   */
  app.delete("/owners/v1/me", comprobarContrasena, async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const cuerpo = cuentaBorrarBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const [o] = await db.select().from(owners).where(eq(owners.id, d.ownerId));
    if (!o || !(await verificarPassword(cuerpo.data.password, o.passwordHash)))
      return reply.code(403).send({ error: "contraseña incorrecta" });

    const ids = (await db.select({ id: pets.id }).from(pets).where(eq(pets.ownerId, o.id))).map((p) => p.id);
    // Lo que vive en el almacén de objetos se apunta antes: las filas que lo señalan se van en cascada.
    const objetos = ids.length
      ? [
          ...(await db.select({ k: petProfiles.fotoKey }).from(petProfiles).where(inArray(petProfiles.petId, ids))),
          ...(await db.select({ k: blobs.s3Key }).from(blobs).where(inArray(blobs.petId, ids))),
          ...(await db
            .select({ k: inboxAdjuntos.s3Key })
            .from(inboxAdjuntos)
            .innerJoin(inbox, eq(inbox.id, inboxAdjuntos.inboxId))
            .where(inArray(inbox.petId, ids))),
        ]
          .map((x) => x.k)
          .filter((k): k is string => !!k)
      : [];

    await db.transaction(async (tx) => {
      if (ids.length) {
        // Los borradores de las clínicas no se borran con la mascota: solo dejan de apuntarla.
        await tx.update(drafts).set({ claimedByPetId: null }).where(inArray(drafts.claimedByPetId, ids));
        await tx.delete(pets).where(inArray(pets.id, ids));
      }
      await tx.delete(recuperaciones).where(and(eq(recuperaciones.tipo, "dueno"), eq(recuperaciones.sujetoId, o.id)));
      await tx.delete(owners).where(eq(owners.id, o.id));
    });
    // Si el almacén falla, lo que queda es huérfano y sellado: nadie más lo abre.
    for (const k of objetos)
      await almacenActual()
        .borrar(k)
        .catch((e) => req.log.warn({ err: (e as Error).message }, "no se pudo borrar un objeto del almacén"));
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  /** Lo que ve el dueño: sus mascotas, su perfil público y sus reclamaciones. */
  app.get("/owners/v1/me", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const [o] = await db.select().from(owners).where(eq(owners.id, d.ownerId));
    const mias = await db
      .select({
        petId: pets.id,
        estado: pets.estado,
        chipPista: pets.chipPista,
        activada: pets.activatedAt,
        nombre: petProfiles.nombre,
        bio: petProfiles.bio,
        telefonos: petProfiles.telefonos,
        publicado: petProfiles.publicado,
        fotoId: petProfiles.fotoId,
      })
      .from(pets)
      .leftJoin(petProfiles, eq(petProfiles.petId, pets.id))
      .where(and(eq(pets.ownerId, d.ownerId), ne(pets.estado, "retirada")))
      .orderBy(pets.createdAt);

    const ids = mias.map((m) => m.petId);
    const recs = ids.length
      ? await db
          .select()
          .from(reclamaciones)
          .where(
            and(
              inArray(reclamaciones.estado, ["abierta", "impugnada"]),
              or(inArray(reclamaciones.petId, ids), inArray(reclamaciones.reclamantePetId, ids)),
            ),
          )
      : [];
    // Cuántos mensajes esperan por mascota. Solo el número: qué dicen, y si son
    // notas o avisos, va sellado y el servidor no lo sabe.
    const enBandeja = ids.length
      ? await db
          .select({ petId: inbox.petId, n: count() })
          .from(inbox)
          .where(inArray(inbox.petId, ids))
          .groupBy(inbox.petId)
      : [];

    // Si hay ficha de salud y placa. Solo que existen: van cifradas.
    const bloques = ids.length
      ? await db
          .select({ petId: blobs.petId, kind: blobs.kind })
          .from(blobs)
          .where(and(inArray(blobs.petId, ids), inArray(blobs.kind, ["record", "emergency"])))
      : [];
    const tiene = (petId: string, kind: "record" | "emergency") =>
      bloques.some((b) => b.petId === petId && b.kind === kind);

    return {
      correo: o.email,
      pubKey: o.pubKey.toString("base64"),
      /** Si ya guardó la clave de recuperación del papel. */
      recuperacion: !!o.recoveryPub,
      segundoFactor: canalDe(o),
      telefono: o.telefono
        ? { numero: enmascararTelefono(o.telefono), verificado: !!o.telefonoVerificadoAt }
        : null,
      mascotas: mias.map((m) => {
        const r = recs.find((x) => x.petId === m.petId || x.reclamantePetId === m.petId);
        return {
          petId: m.petId,
          estado: m.estado,
          chipPista: m.chipPista,
          activada: m.activada,
          mensajes: enBandeja.find((x) => x.petId === m.petId)?.n ?? 0,
          ficha: tiene(m.petId, "record"),
          placa: tiene(m.petId, "emergency"),
          perfil: {
            nombre: m.nombre ?? "",
            bio: m.bio ?? "",
            telefonos: m.telefonos ?? [],
            publicado: m.publicado ?? false,
            // La ruta privada del dueño: la ve aunque no esté publicada ni activa.
            foto: m.fotoId ? `/owners/v1/pets/${m.petId}/photo?v=${m.fotoId}` : null,
          },
          reclamacion: r
            ? {
                id: r.id,
                plazo: r.plazo,
                estado: r.estado,
                /** titular: han reclamado su chip. reclamante: reclama el de otro. */
                rol: r.petId === m.petId ? "titular" : "reclamante",
              }
            : null,
        };
      }),
    };
  });

  /** Otra mascota en la misma cuenta. Queda pendiente, como la primera. */
  app.post("/owners/v1/pets", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const cuerpo = ownerPetBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const [o] = await db.select({ pubKey: owners.pubKey }).from(owners).where(eq(owners.id, d.ownerId));
    const m = await registrarPendiente({
      identificador: cuerpo.data.identificador,
      ownerPubKey: o.pubKey,
      ownerId: d.ownerId,
    });
    await db.insert(petProfiles).values({ petId: m.petId, nombre: cuerpo.data.nombre.trim() });
    return reply.code(201).send(m);
  });

  /** Nuevo código de activación: se muestra una vez; el anterior deja de valer. */
  app.post("/owners/v1/pets/:id/activation-code", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const p = await mascotaDe(d, (req.params as { id: string }).id, reply);
    if (!p) return;
    if (p.estado !== "pendiente")
      return reply.code(409).send({ error: "ya está activa", motivo: "no-pendiente" });
    return nuevoCodigoActivacion(p.id);
  });

  /** Perfil público: lo que ve quien encuentre al animal, si el dueño lo publica. */
  app.put("/owners/v1/pets/:id/profile", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const p = await mascotaDe(d, (req.params as { id: string }).id, reply);
    if (!p) return;
    const cuerpo = perfilBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido", detalle: cuerpo.error.issues[0]?.message });
    const v = { ...cuerpo.data, nombre: cuerpo.data.nombre.trim(), bio: cuerpo.data.bio.trim(), actualizado: new Date() };
    await db
      .insert(petProfiles)
      .values({ petId: p.id, ...v })
      .onConflictDoUpdate({ target: petProfiles.petId, set: v });
    return { ok: true };
  });

  /** Foto del perfil: JPEG, PNG o WebP de hasta 2 MB. Cada foto nueva tiene URL nueva. */
  app.put("/owners/v1/pets/:id/photo", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const p = await mascotaDe(d, (req.params as { id: string }).id, reply);
    if (!p) return;
    const cuerpo = req.body;
    if (!Buffer.isBuffer(cuerpo)) return reply.code(415).send({ error: "sube una imagen", motivo: "tipo" });
    const tipo = tipoDeImagen(cuerpo);
    if (!tipo) return reply.code(415).send({ error: "solo JPEG, PNG o WebP", motivo: "tipo" });

    const fotoId = randomUUID();
    const fotoKey = claves.foto(fotoId);
    try {
      await almacenActual().guardar(fotoKey, cuerpo, tipo);
    } catch (e) {
      req.log.error({ err: e }, "no se pudo guardar la foto en el almacén");
      return reply.code(503).send({ error: "no se pudo guardar la foto", motivo: "almacen" });
    }
    const anterior = await fotoGuardada(p.id);
    await db
      .insert(petProfiles)
      .values({ petId: p.id, fotoKey, fotoTipo: tipo, fotoId })
      .onConflictDoUpdate({
        target: petProfiles.petId,
        set: { fotoKey, foto: null, fotoTipo: tipo, fotoId, actualizado: new Date() },
      });
    await soltarFoto(anterior, req);
    return { foto: `/owners/v1/pets/${p.id}/photo?v=${fotoId}` };
  });

  /* La foto vista por su dueño: esté o no publicada, y esté o no activo el
     chip. La ruta pública (/perfil/v1/foto) solo la sirve si lo está. */
  app.get("/owners/v1/pets/:id/photo", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const p = await mascotaDe(d, (req.params as { id: string }).id, reply);
    if (!p) return;
    const [f] = await db
      .select({ foto: petProfiles.foto, fotoKey: petProfiles.fotoKey, tipo: petProfiles.fotoTipo })
      .from(petProfiles)
      .where(eq(petProfiles.petId, p.id))
      .limit(1);
    const bytes = f ? await bytesDeFoto(f) : null;
    if (!bytes || !f?.tipo) return reply.code(404).send({ error: "sin foto" });
    reply.header("content-type", f.tipo);
    // Privada: la URL lleva ?v=<id de la foto>, así que cambia con cada foto nueva.
    reply.header("cache-control", "private, max-age=86400");
    reply.header("x-content-type-options", "nosniff");
    return reply.send(bytes);
  });

  app.delete("/owners/v1/pets/:id/photo", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const p = await mascotaDe(d, (req.params as { id: string }).id, reply);
    if (!p) return;
    const anterior = await fotoGuardada(p.id);
    await db
      .update(petProfiles)
      .set({ foto: null, fotoKey: null, fotoTipo: null, fotoId: null, actualizado: new Date() })
      .where(eq(petProfiles.petId, p.id));
    await soltarFoto(anterior, req);
    return { ok: true };
  });

  /* ── Segundo factor por SMS ───────────────────────────────── */

  /**
   * Poner o cambiar el teléfono: le llega un código por SMS y no cuenta como
   * canal hasta confirmarlo. Cambiarlo deja el correo como canal mientras
   * tanto, para que un teléfono sin confirmar nunca sea el único camino.
   */
  app.put("/owners/v1/phone", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const cuerpo = telefonoBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const telefono = normalizarTelefono(cuerpo.data.telefono);
    if (!telefono)
      return reply.code(400).send({ error: "teléfono no válido o de un país sin SMS", motivo: "telefono" });

    const [o] = await db.select({ ultimo: owners.smsUltimo }).from(owners).where(eq(owners.id, d.ownerId));
    const espera = o.ultimo ? o.ultimo.getTime() + REENVIO_MS - Date.now() : 0;
    if (espera > 0) return reply.code(429).send({ error: "espera antes de pedir otro código", motivo: "espera", segundos: Math.ceil(espera / 1000) });
    if (!(await reservarSms(d.ownerId)))
      return reply.code(429).send({ error: "límite diario de SMS", motivo: "sin-cupo-sms" });

    const codigo = nuevoCodigoCorreo();
    try {
      await enviarSms({
        para: telefono,
        texto: `Bark & Meow: tu código para confirmar este teléfono es ${codigo.slice(0, 4)}-${codigo.slice(4)}. Caduca en 15 minutos.`,
      });
    } catch (e) {
      req.log.warn({ err: (e as Error).message }, "no se pudo enviar el SMS de confirmación");
      return reply.code(502).send({ error: "no se pudo enviar el SMS", motivo: "envio" });
    }
    await db
      .update(owners)
      .set({
        telefono,
        telefonoVerificadoAt: null,
        segundoFactor: "correo",
        telefonoCodigoHash: hashCodigoCorreo(`tel:${d.ownerId}:${telefono}`, codigo),
        telefonoCodigoCaduca: new Date(Date.now() + PENDIENTE_MS),
        telefonoCodigoIntentos: 0,
      })
      .where(eq(owners.id, d.ownerId));
    return reply.code(202).send({ enviado: true, telefono: enmascararTelefono(telefono) });
  });

  /** Confirmar el teléfono con el código del SMS. Desde ese momento, el SMS es el canal. */
  app.post("/owners/v1/phone/verify", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const cuerpo = codigoCorreoBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const [o] = await db.select().from(owners).where(eq(owners.id, d.ownerId));
    if (!o.telefono || !o.telefonoCodigoHash || !o.telefonoCodigoCaduca || o.telefonoCodigoCaduca < new Date())
      return reply.code(410).send({ error: "caducado", motivo: "caducado" });

    const [reserva] = await db
      .update(owners)
      .set({ telefonoCodigoIntentos: sql`${owners.telefonoCodigoIntentos} + 1` })
      .where(and(eq(owners.id, o.id), lt(owners.telefonoCodigoIntentos, INTENTOS)))
      .returning({ intentos: owners.telefonoCodigoIntentos });
    if (!reserva) return reply.code(429).send({ error: "demasiados intentos", motivo: "demasiados-intentos" });

    const esperado = hashCodigoCorreo(`tel:${o.id}:${o.telefono}`, normalizarCodigoCorreo(cuerpo.data.codigo));
    if (!mismoHash(esperado, o.telefonoCodigoHash))
      return reply.code(400).send({
        error: "código incorrecto",
        motivo: "incorrecto",
        intentosRestantes: Math.max(0, INTENTOS - reserva.intentos),
      });

    await db
      .update(owners)
      .set({ telefonoVerificadoAt: new Date(), segundoFactor: "sms", telefonoCodigoHash: null, telefonoCodigoCaduca: null })
      .where(eq(owners.id, o.id));
    return { ok: true, segundoFactor: "sms" };
  });

  /** Quitar el teléfono: el código vuelve a llegar por correo. */
  app.delete("/owners/v1/phone", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    await db
      .update(owners)
      .set({ telefono: null, telefonoVerificadoAt: null, telefonoCodigoHash: null, telefonoCodigoCaduca: null, segundoFactor: "correo" })
      .where(eq(owners.id, d.ownerId));
    return { ok: true, segundoFactor: "correo" };
  });

  /** Elegir el canal del código de entrada. «sms» exige el teléfono confirmado. */
  app.put("/owners/v1/second-factor", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const cuerpo = segundoFactorBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const r = await db
      .update(owners)
      .set({ segundoFactor: cuerpo.data.canal })
      .where(
        and(
          eq(owners.id, d.ownerId),
          cuerpo.data.canal === "sms" ? sql`${owners.telefonoVerificadoAt} is not null` : undefined,
        ),
      )
      .returning({ id: owners.id });
    if (!r.length) return reply.code(409).send({ error: "confirma antes un teléfono", motivo: "sin-telefono" });
    return { ok: true, segundoFactor: cuerpo.data.canal };
  });

  /* ── Móviles con la app: avisos push ─────────────────────── */

  /** Registrar el token push del móvil. Si ya era de otra cuenta, pasa a esta. */
  app.post("/owners/v1/devices", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const cuerpo = dispositivoBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const [{ n }] = await db.select({ n: count() }).from(ownerDevices).where(eq(ownerDevices.ownerId, d.ownerId));
    if (n >= DISPOSITIVOS_MAX) {
      // El más antiguo sale: un móvil que se cambia no deja la cuenta bloqueada.
      const [viejo] = await db
        .select({ id: ownerDevices.id })
        .from(ownerDevices)
        .where(eq(ownerDevices.ownerId, d.ownerId))
        .orderBy(sql`coalesce(${ownerDevices.ultimoUso}, ${ownerDevices.createdAt})`)
        .limit(1);
      if (viejo) await db.delete(ownerDevices).where(eq(ownerDevices.id, viejo.id));
    }
    await db
      .insert(ownerDevices)
      .values({ ownerId: d.ownerId, plataforma: cuerpo.data.plataforma, token: cuerpo.data.token })
      .onConflictDoUpdate({ target: ownerDevices.token, set: { ownerId: d.ownerId, createdAt: new Date() } });
    return reply.code(201).send({ ok: true });
  });

  /** Dejar de recibir avisos en este móvil (al salir de la app). */
  app.delete("/owners/v1/devices", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const cuerpo = dispositivoRetirarBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    await db
      .delete(ownerDevices)
      .where(and(eq(ownerDevices.ownerId, d.ownerId), eq(ownerDevices.token, cuerpo.data.token)));
    return { ok: true };
  });

  /**
   * Impugnar una reclamación sobre mi chip. Detiene el traspaso automático de
   * los 14 días; el caso pasa a revisión a mano con la documentación de las
   * dos partes.
   */
  app.post("/owners/v1/claims/:id/contest", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const { id } = req.params as { id: string };
    if (!/^[0-9a-f-]{36}$/.test(id)) return reply.code(404).send({ error: "no encontrada" });

    const [r] = await db
      .select({ id: reclamaciones.id, estado: reclamaciones.estado })
      .from(reclamaciones)
      .innerJoin(pets, eq(pets.id, reclamaciones.petId))
      .where(and(eq(reclamaciones.id, id), eq(pets.ownerId, d.ownerId)))
      .limit(1);
    if (!r) return reply.code(404).send({ error: "no encontrada" });
    if (r.estado !== "abierta")
      return reply.code(409).send({ error: "ya no está abierta", motivo: r.estado });

    await db.update(reclamaciones).set({ estado: "impugnada" }).where(eq(reclamaciones.id, r.id));
    return { estado: "impugnada" };
  });

  /**
   * Bandeja: notas de consulta, avisos de nivel 0 e informes del software de
   * gestión, sellados a la clave pública del dueño. Salen tal cual; se abren en
   * su navegador con la clave que sale de su código en papel. El servidor no
   * sabe qué dicen. De las notas y los avisos tampoco sabe de qué clínica son;
   * de los informes sí, por la clave de API, y eso sale como `origen`.
   */
  app.get("/owners/v1/inbox", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const filas = await db
      .select({
        id: inbox.id,
        petId: inbox.petId,
        sealed: inbox.sealed,
        llegada: inbox.createdAt,
        clinica: clinics.name,
        pais: clinics.country,
        dominio: clinics.domain,
        verificada: clinics.domainVerifiedAt,
        firmaPub: clinicApiKeys.firmaPub,
      })
      .from(inbox)
      .innerJoin(pets, eq(pets.id, inbox.petId))
      .leftJoin(clinics, eq(clinics.id, inbox.clinicId))
      .leftJoin(clinicApiKeys, eq(clinicApiKeys.id, inbox.apiKeyId))
      .where(and(eq(pets.ownerId, d.ownerId), ne(pets.estado, "retirada")))
      .orderBy(desc(inbox.createdAt))
      .limit(BANDEJA_MAX);
    const adjuntos = filas.length
      ? await db
          .select({ id: inboxAdjuntos.id, inboxId: inboxAdjuntos.inboxId, orden: inboxAdjuntos.orden, bytes: inboxAdjuntos.bytes })
          .from(inboxAdjuntos)
          .where(inArray(inboxAdjuntos.inboxId, filas.map((f) => f.id)))
          .orderBy(inboxAdjuntos.inboxId, inboxAdjuntos.orden)
      : [];
    reply.header("cache-control", "no-store");
    return {
      mensajes: filas.map((f) => ({
        id: f.id,
        petId: f.petId,
        sellado: f.sealed.toString("base64"),
        llegada: f.llegada.toISOString(),
        /** PDF sellados aparte, en el orden de `adjuntos` del registro firmado. */
        adjuntos: adjuntos
          .filter((a) => a.inboxId === f.id)
          .map((a) => ({ id: a.id, orden: a.orden, bytes: a.bytes })),
        origen: f.clinica
          ? {
              clinica: f.clinica,
              pais: f.pais,
              // Un dominio sin verificar no dice nada.
              dominio: f.verificada ? f.dominio : null,
              /** La clave de firma de la conexión que lo envió: la que tiene que firmar. */
              firma: f.firmaPub ? f.firmaPub.toString("base64") : null,
            }
          : null,
      })),
    };
  });

  /** Borrar un mensaje de la bandeja. No hay papelera: se va del servidor. */
  app.delete("/owners/v1/inbox/:id", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const { id } = req.params as { id: string };
    if (!/^[0-9a-f-]{36}$/.test(id)) return reply.code(404).send({ error: "no encontrado" });

    const [m] = await db
      .select({ id: inbox.id })
      .from(inbox)
      .innerJoin(pets, eq(pets.id, inbox.petId))
      .where(and(eq(inbox.id, id), eq(pets.ownerId, d.ownerId), ne(pets.estado, "retirada")))
      .limit(1);
    if (!m) return reply.code(404).send({ error: "no encontrado" });

    await borrarDeLaBandeja([m.id], req.log);
    return { ok: true };
  });

  /** Borrar varios mensajes de golpe. Los ids que no son de este dueño se ignoran. */
  app.delete("/owners/v1/inbox", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const cuerpo = bandejaBorrarBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const suyos = await db
      .select({ id: inbox.id })
      .from(inbox)
      .innerJoin(pets, eq(pets.id, inbox.petId))
      .where(and(inArray(inbox.id, cuerpo.data.ids), eq(pets.ownerId, d.ownerId), ne(pets.estado, "retirada")));
    await borrarDeLaBandeja(
      suyos.map((m) => m.id),
      req.log,
    );
    return { borrados: suyos.length };
  });

  /** Un PDF adjunto, sellado. Se abre en el navegador o el móvil del dueño. */
  app.get("/owners/v1/inbox/:id/attachments/:adjuntoId", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const { id, adjuntoId } = req.params as { id: string; adjuntoId: string };
    if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(adjuntoId))
      return reply.code(404).send({ error: "no encontrado" });

    const [a] = await db
      .select({ s3Key: inboxAdjuntos.s3Key })
      .from(inboxAdjuntos)
      .innerJoin(inbox, eq(inbox.id, inboxAdjuntos.inboxId))
      .innerJoin(pets, eq(pets.id, inbox.petId))
      .where(
        and(
          eq(inboxAdjuntos.id, adjuntoId),
          eq(inbox.id, id),
          eq(pets.ownerId, d.ownerId),
          ne(pets.estado, "retirada"),
        ),
      )
      .limit(1);
    if (!a) return reply.code(404).send({ error: "no encontrado" });
    let bytes: Buffer | null;
    try {
      bytes = await almacenActual().leer(a.s3Key);
    } catch (e) {
      req.log.error({ err: (e as Error).message }, "no se pudo leer un adjunto del almacén");
      return reply.code(503).send({ error: "almacén no disponible", motivo: "almacen" });
    }
    if (!bytes) return reply.code(404).send({ error: "no encontrado" });
    reply.header("content-type", "application/octet-stream");
    reply.header("cache-control", "private, no-store");
    return reply.send(bytes);
  });
}

/** Avisa por correo al titular de un chip reclamado, si tiene cuenta en el portal. */
export async function avisarReclamacion(petId: string, plazo: Date) {
  const [o] = await db
    .select({ email: owners.email, chipPista: pets.chipPista, nombre: petProfiles.nombre })
    .from(pets)
    .innerJoin(owners, eq(owners.id, pets.ownerId))
    .leftJoin(petProfiles, eq(petProfiles.petId, pets.id))
    .where(eq(pets.id, petId))
    .limit(1);
  if (!o) return;
  await avisarPush({ tipo: "reclamacion", petId });
  const d = plazo;
  const fecha = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  await enviarCorreo({
    para: o.email,
    asunto: `Han reclamado el chip de ${o.nombre || "tu mascota"}`,
    texto: [
      `Una clínica veterinaria ha abierto una reclamación sobre el chip terminado en ${o.chipPista ?? "····"}${o.nombre ? ` (${o.nombre})` : ""}.`,
      "Otra persona dice ser su dueña y ha llevado un animal con ese chip a la clínica.",
      "",
      `Si el animal es tuyo, entra y pulsa «Impugnar» antes del ${fecha}:`,
      "",
      `    ${env.portalWebUrl}`,
      "",
      "Si no haces nada, ese día el chip pasará a la otra persona. Mientras tanto, tu",
      "perfil público no se muestra a quien encuentre al animal.",
    ].join("\n"),
  });
}
