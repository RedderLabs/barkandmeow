import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, count, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { inbox, owners, ownerSessions, petIdentifiers, petProfiles, pets, reclamaciones } from "@barkandmeow/db";
import {
  codigoCorreoBody,
  normalizarChip,
  ownerLoginBody,
  ownerPetBody,
  ownerRegisterBody,
  perfilBody,
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
   abre en el navegador del dueño, con la clave de su código en papel. */

const COOKIE = "bam_owner";
const PENDIENTE_MS = 15 * 60 * 1000;
const SESION_DIAS = 30;
const INTENTOS = 5;
const REENVIO_MS = 60 * 1000;
const FOTO_MAX = 2 * 1024 * 1024;
const BANDEJA_MAX = 200;

type Dueno = { ownerId: string; sessionId: string };

const enmascarar = (email: string) => {
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

async function sesionDe(req: FastifyRequest, estado: "pendiente" | "abierta") {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  const [s] = await db
    .select()
    .from(ownerSessions)
    .where(eq(ownerSessions.tokenHash, hashToken(token)))
    .limit(1);
  if (!s || s.estado !== estado || s.expiresAt < new Date()) return null;
  return s;
}

/** El dueño con sesión abierta (contraseña y código del correo), o 401. */
export async function duenoDe(req: FastifyRequest, reply: FastifyReply): Promise<Dueno | null> {
  const s = await sesionDe(req, "abierta");
  if (!s) {
    reply.code(401).send({ error: "sin sesión" });
    return null;
  }
  return { ownerId: s.ownerId, sessionId: s.id };
}

/** Abre una sesión pendiente y envía el código de entrada al correo del dueño. */
async function sesionPendiente(reply: FastifyReply, owner: { id: string; email: string }, asunto: string) {
  const { token, hash } = nuevoToken();
  const codigo = nuevoCodigoCorreo();
  const id = randomUUID();
  await db.insert(ownerSessions).values({
    id,
    ownerId: owner.id,
    tokenHash: hash,
    estado: "pendiente",
    codeHash: hashCodigoCorreo(id, codigo),
    expiresAt: new Date(Date.now() + PENDIENTE_MS),
  });
  await db.update(owners).set({ emailCodeSentAt: new Date() }).where(eq(owners.id, owner.id));
  ponerCookie(reply, token, 1);
  const legible = `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
  await enviarCorreo({
    para: owner.email,
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

/** La mascota, si es de este dueño. */
async function mascotaDe(d: Dueno, petId: string, reply: FastifyReply) {
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
      .values({ email, passwordHash: await hashPassword(b.password), pubKey })
      .returning({ id: owners.id, email: owners.email });
    const mascota = await registrarPendiente({
      identificador: b.mascota.identificador,
      ownerPubKey: pubKey,
      ownerId: owner.id,
    });
    await db.insert(petProfiles).values({ petId: mascota.petId, nombre: b.mascota.nombre.trim() });

    try {
      await sesionPendiente(reply, owner, "Este es el código para confirmar tu cuenta de Bark & Meow:");
    } catch {
      req.log.warn("no se pudo enviar el código del alta");
    }
    return reply.code(201).send({
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
      .select({ id: owners.id, email: owners.email, hash: owners.passwordHash })
      .from(petIdentifiers)
      .innerJoin(pets, eq(pets.id, petIdentifiers.petId))
      .innerJoin(owners, eq(owners.id, pets.ownerId))
      .where(and(eq(petIdentifiers.idIndex, idx), ne(pets.estado, "retirada")))
      .orderBy(sql`${owners.emailVerifiedAt} is null`, sql`${pets.estado} <> 'activa'`)
      .limit(5);

    let owner: { id: string; email: string } | null = null;
    for (const c of candidatos)
      if (await verificarPassword(cuerpo.data.password, c.hash)) {
        owner = c;
        break;
      }
    // Presupuesto fijo: con o sin cuenta, la respuesta tarda lo mismo.
    await gastarPresupuesto(t0, 600);
    if (!owner) return reply.code(401).send({ error: "chip o contraseña incorrectos" });

    try {
      await sesionPendiente(reply, owner, "Este es el código para entrar en Bark & Meow:");
    } catch {
      return reply.code(502).send({ error: "no se pudo enviar el código", motivo: "envio" });
    }
    return { enviado: true, correo: enmascarar(owner.email) };
  });

  /** Entrar, segundo paso (y confirmación del alta): el código del correo. */
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
    ponerCookie(reply, token, SESION_DIAS);
    return { ok: true };
  });

  /** Otro código para la sesión pendiente. Uno por minuto. */
  app.post("/owners/v1/login/resend", async (req, reply) => {
    const s = await sesionDe(req, "pendiente");
    if (!s) return reply.code(410).send({ error: "caducado", motivo: "caducado" });
    const [o] = await db.select().from(owners).where(eq(owners.id, s.ownerId));
    const espera = o.emailCodeSentAt ? o.emailCodeSentAt.getTime() + REENVIO_MS - Date.now() : 0;
    if (espera > 0) return reply.code(429).send({ motivo: "espera", segundos: Math.ceil(espera / 1000) });

    await db.delete(ownerSessions).where(eq(ownerSessions.id, s.id));
    try {
      await sesionPendiente(reply, o, "Este es tu nuevo código de Bark & Meow:");
    } catch {
      return reply.code(502).send({ error: "no se pudo enviar el código", motivo: "envio" });
    }
    return reply.code(202).send({ enviado: true, correo: enmascarar(o.email) });
  });

  app.post("/owners/v1/logout", async (req, reply) => {
    const token = req.cookies?.[COOKIE];
    if (token) await db.delete(ownerSessions).where(eq(ownerSessions.tokenHash, hashToken(token)));
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

    return {
      correo: o.email,
      pubKey: o.pubKey.toString("base64"),
      mascotas: mias.map((m) => {
        const r = recs.find((x) => x.petId === m.petId || x.reclamantePetId === m.petId);
        return {
          petId: m.petId,
          estado: m.estado,
          chipPista: m.chipPista,
          activada: m.activada,
          mensajes: enBandeja.find((x) => x.petId === m.petId)?.n ?? 0,
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
   * Bandeja: notas de consulta y avisos de nivel 0, sellados a la clave pública
   * del dueño. Salen tal cual; se abren en su navegador con la clave que sale
   * de su código en papel. El servidor no sabe qué dicen ni de qué clínica son.
   */
  app.get("/owners/v1/inbox", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const filas = await db
      .select({ id: inbox.id, petId: inbox.petId, sealed: inbox.sealed, llegada: inbox.createdAt })
      .from(inbox)
      .innerJoin(pets, eq(pets.id, inbox.petId))
      .where(and(eq(pets.ownerId, d.ownerId), ne(pets.estado, "retirada")))
      .orderBy(desc(inbox.createdAt))
      .limit(BANDEJA_MAX);
    reply.header("cache-control", "no-store");
    return {
      mensajes: filas.map((f) => ({
        id: f.id,
        petId: f.petId,
        sellado: f.sealed.toString("base64"),
        llegada: f.llegada.toISOString(),
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

    await db.delete(inbox).where(eq(inbox.id, m.id));
    return { ok: true };
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
