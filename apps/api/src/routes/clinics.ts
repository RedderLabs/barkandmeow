import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, count, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { clinicMembers, clinicSessions, clinics, drafts } from "@barkandmeow/db";
import {
  clinicKeyBody,
  clinicRegisterBody,
  codigoCorreoBody,
  dominioDeCorreo,
  draftCreateBody,
  loginBody,
  memberAcceptBody,
  memberInviteBody,
} from "@barkandmeow/schema";
import {
  db,
  enviarCorreo,
  env,
  hashCodigoCorreo,
  hashPassword,
  hashToken,
  mismoHash,
  normalizarCodigoCorreo,
  nuevoCodigoCorreo,
  nuevoToken,
  verificarPassword,
} from "../core.js";
import { INVITACION_VIGENCIA_MS, purgarSinVerificar } from "../limpieza.js";

export type Sesion = {
  memberId: string;
  clinicId: string;
  role: "admin" | "vet" | "assistant";
  /** La clínica está activa cuando su administrador ha verificado el correo. */
  clinicaActiva: boolean;
};

const COOKIE = "bam_clinic";

/* ── Verificación por correo ──────────────────────────────────
   El administrador que registra la clínica recibe un código en su correo. Si
   el correo es de dominio propio (nombre@clinica.es), validarlo verifica
   también el dominio: solo alguien de esa organización recibe correo ahí.
   Con un correo gratuito el correo queda verificado, pero la clínica no. */

const CODIGO_VIGENCIA_MS = 15 * 60 * 1000;
const CODIGO_INTENTOS = 5;
const CODIGO_REENVIO_MS = 60 * 1000;

async function enviarCodigo(m: { id: string; email: string }) {
  const codigo = nuevoCodigoCorreo();
  await db
    .update(clinicMembers)
    .set({
      emailCodeHash: hashCodigoCorreo(m.id, codigo),
      emailCodeExpiresAt: new Date(Date.now() + CODIGO_VIGENCIA_MS),
      emailCodeAttempts: 0,
      emailCodeSentAt: new Date(),
    })
    .where(eq(clinicMembers.id, m.id));
  const legible = `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
  await enviarCorreo({
    para: m.email,
    asunto: `${legible} es tu código de Bark & Meow`,
    texto: [
      // Sin el nombre de la clínica ni del miembro: los escribe quien se da de
      // alta, y este correo puede llegar a cualquier dirección.
      "Este es el código para verificar el correo de tu clínica en Bark & Meow:",
      "",
      `    ${legible}`,
      "",
      "Caduca en 15 minutos. Si no has registrado ninguna clínica, ignora este correo:",
      "sin el código no se activa nada.",
    ].join("\n"),
  });
}

/* Las rutas que hacen scrypt o envían correo sin sesión previa llevan límite
   propio por IP: el resto del SaaS no tiene límite global. */
const ALTAS_POR_MINUTO = Number(process.env.LIMITE_ALTAS_CLINICA ?? 5);
const limitePorIp = (max: number) => ({ max, timeWindow: "1 minute" });
const INVITACIONES_POR_DIA = Number(process.env.LIMITE_INVITACIONES_DIA ?? 20);

let senuelo: Promise<string> | null = null;
const hashSenuelo = () => (senuelo ??= hashPassword(randomBytes(32).toString("base64")));

/** Rechaza la petición si la clínica aún no ha verificado el correo. */
function exigirActiva(s: Sesion, reply: FastifyReply): boolean {
  if (s.clinicaActiva) return true;
  reply.code(403).send({ error: "verifica el correo de la clínica primero", motivo: "correo-sin-verificar" });
  return false;
}

export async function sesionDe(req: FastifyRequest): Promise<Sesion | null> {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  const filas = await db
    .select({
      memberId: clinicMembers.id,
      clinicId: clinicMembers.clinicId,
      role: clinicMembers.role,
      expiresAt: clinicSessions.expiresAt,
      revokedAt: clinicMembers.revokedAt,
    })
    .from(clinicSessions)
    .innerJoin(clinicMembers, eq(clinicMembers.id, clinicSessions.memberId))
    .where(eq(clinicSessions.tokenHash, hashToken(token)))
    .limit(1);

  const s = filas[0];
  if (!s || s.revokedAt || s.expiresAt < new Date()) return null;

  const verificado = await db
    .select({ id: clinicMembers.id })
    .from(clinicMembers)
    .where(
      and(
        eq(clinicMembers.clinicId, s.clinicId),
        eq(clinicMembers.role, "admin"),
        isNotNull(clinicMembers.emailVerifiedAt),
      ),
    )
    .limit(1);
  return {
    memberId: s.memberId,
    clinicId: s.clinicId,
    role: s.role,
    clinicaActiva: verificado.length > 0,
  };
}

async function abrirSesion(memberId: string) {
  const { token, hash } = nuevoToken();
  const expiresAt = new Date(Date.now() + env.sessionDays * 864e5);
  await db.insert(clinicSessions).values({ memberId, tokenHash: hash, expiresAt });
  return { token, expiresAt };
}

export default async function rutasClinicas(app: FastifyInstance) {
  /** Alta de la clínica. Crea la organización y a su primer administrador. */
  app.post("/clinics/v1/register", { config: { rateLimit: limitePorIp(ALTAS_POR_MINUTO) } }, async (req, reply) => {
    const parsed = clinicRegisterBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const b = parsed.data;

    await purgarSinVerificar();
    const yaExiste = await db
      .select({ id: clinicMembers.id })
      .from(clinicMembers)
      .where(eq(clinicMembers.email, b.admin.email.toLowerCase()))
      .limit(1);
    if (yaExiste.length) return reply.code(409).send({ error: "correo ya usado" });

    // El dominio no se pregunta: sale del correo, y solo si no es gratuito.
    // Queda pendiente hasta que el administrador valide el código.
    const dominio = dominioDeCorreo(b.admin.email);

    const [clinica] = await db
      .insert(clinics)
      .values({
        name: b.nombre,
        country: b.pais.toUpperCase(),
        healthRegistry: b.registroSanitario ?? null,
        address: b.direccion ?? null,
        domain: dominio,
        pubKey: Buffer.from(b.pubKey, "base64"),
      })
      .returning();

    const [miembro] = await db
      .insert(clinicMembers)
      .values({
        clinicId: clinica.id,
        name: b.admin.nombre,
        email: b.admin.email.toLowerCase(),
        role: "admin",
        passwordHash: await hashPassword(b.admin.password),
        devicePubKey: Buffer.from(b.admin.devicePubKey, "base64"),
        acceptedAt: new Date(),
      })
      .returning();

    const { token } = await abrirSesion(miembro.id);
    reply.setCookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: env.sessionDays * 86400,
    });

    try {
      await enviarCodigo(miembro);
    } catch (e) {
      // La clínica queda creada; el código se puede pedir de nuevo.
      req.log.warn({ err: (e as Error).message }, "no se pudo enviar el código de verificación");
    }

    return reply.code(201).send({
      clinicId: clinica.id,
      memberId: miembro.id,
      correo: miembro.email,
      /** El dominio que quedará verificado al validar el código, o null si el correo es gratuito. */
      dominio,
      correoVerificado: false,
    });
  });

  /** Valida el código del correo. Con correo de dominio propio, verifica la clínica. */
  app.post("/clinics/v1/email/verify", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    const cuerpo = codigoCorreoBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const [m] = await db.select().from(clinicMembers).where(eq(clinicMembers.id, s.memberId));
    const [c] = await db.select().from(clinics).where(eq(clinics.id, s.clinicId));
    const resultado = (clinicaVerificada: boolean) => ({
      verificado: true,
      dominio: clinicaVerificada ? c.domain : null,
      clinicaVerificada,
    });
    if (m.emailVerifiedAt) return resultado(!!c.domainVerifiedAt);

    if (!m.emailCodeHash || !m.emailCodeExpiresAt || m.emailCodeExpiresAt < new Date())
      return reply.code(410).send({ error: "código caducado", motivo: "caducado" });
    /* El intento se reserva antes de comparar y en una sola sentencia: con
       peticiones en paralelo nadie pasa del tope. Si acierta, se pone a cero. */
    const [reserva] = await db
      .update(clinicMembers)
      .set({ emailCodeAttempts: sql`${clinicMembers.emailCodeAttempts} + 1` })
      .where(and(eq(clinicMembers.id, m.id), lt(clinicMembers.emailCodeAttempts, CODIGO_INTENTOS)))
      .returning({ intentos: clinicMembers.emailCodeAttempts });
    if (!reserva)
      return reply.code(429).send({ error: "demasiados intentos", motivo: "demasiados-intentos" });

    const codigo = normalizarCodigoCorreo(cuerpo.data.codigo);
    if (!mismoHash(hashCodigoCorreo(m.id, codigo), m.emailCodeHash)) {
      const intentos = reserva.intentos;
      return reply.code(400).send({
        error: "código incorrecto",
        motivo: "incorrecto",
        intentosRestantes: Math.max(0, CODIGO_INTENTOS - intentos),
      });
    }

    const ahora = new Date();
    await db
      .update(clinicMembers)
      .set({ emailVerifiedAt: ahora, emailCodeHash: null, emailCodeExpiresAt: null, emailCodeAttempts: 0 })
      .where(eq(clinicMembers.id, m.id));

    // El correo de un administrador en el dominio de la clínica verifica el dominio.
    const verificaDominio = m.role === "admin" && !!c.domain && dominioDeCorreo(m.email) === c.domain;
    if (verificaDominio && !c.domainVerifiedAt)
      await db.update(clinics).set({ domainVerifiedAt: ahora }).where(eq(clinics.id, c.id));
    return resultado(verificaDominio || !!c.domainVerifiedAt);
  });

  /** Envía un código nuevo. Como mucho uno por minuto. */
  app.post("/clinics/v1/email/resend", { config: { rateLimit: limitePorIp(3) } }, async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    const [m] = await db.select().from(clinicMembers).where(eq(clinicMembers.id, s.memberId));
    if (m.emailVerifiedAt) return reply.code(409).send({ error: "ya verificado", motivo: "ya-verificado" });

    const espera = m.emailCodeSentAt ? m.emailCodeSentAt.getTime() + CODIGO_REENVIO_MS - Date.now() : 0;
    if (espera > 0)
      return reply.code(429).send({ error: "espera", motivo: "espera", segundos: Math.ceil(espera / 1000) });

    try {
      await enviarCodigo(m);
    } catch {
      return reply.code(502).send({ error: "no se pudo enviar el correo", motivo: "envio" });
    }
    return reply.code(202).send({ enviado: true, correo: m.email });
  });

  /* Límite por cuenta, no por IP: tras Cloudflare muchas clínicas comparten
     IP de salida, y lo que se protege es la contraseña de cada miembro. */
  const LOGIN_POR_MINUTO = Number(process.env.LIMITE_LOGIN_CLINICA ?? 10);
  app.post(
    "/clinics/v1/login",
    {
      config: {
        rateLimit: {
          max: LOGIN_POR_MINUTO,
          timeWindow: "1 minute",
          // Tras parsear el cuerpo: la clave es el correo, no la IP.
          hook: "preHandler",
          keyGenerator: (req: FastifyRequest) => {
            const email = (req.body as { email?: unknown } | undefined)?.email;
            return typeof email === "string" ? `login:${email.trim().toLowerCase()}` : `login-ip:${req.ip}`;
          },
        },
      },
    },
    async (req, reply) => {
      const parsed = loginBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });

      const filas = await db
        .select()
        .from(clinicMembers)
        .where(eq(clinicMembers.email, parsed.data.email.toLowerCase()))
        .limit(1);
      const m = filas[0];

      // Sin cuenta también se hace un scrypt, contra un hash señuelo: el tiempo
      // de respuesta no dice qué correos están registrados.
      const valida = await verificarPassword(parsed.data.password, m?.passwordHash ?? (await hashSenuelo()));
      const ok = !!m && !m.revokedAt && valida;
      if (!ok) return reply.code(401).send({ error: "credenciales inválidas" });

      const { token } = await abrirSesion(m.id);
      reply.setCookie(COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: env.sessionDays * 86400,
      });
      return { memberId: m.id, clinicId: m.clinicId, role: m.role };
    },
  );

  app.post("/clinics/v1/logout", async (req, reply) => {
    const token = req.cookies?.[COOKIE];
    if (token)
      await db.delete(clinicSessions).where(eq(clinicSessions.tokenHash, hashToken(token)));
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/clinics/v1/me", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    const [c] = await db.select().from(clinics).where(eq(clinics.id, s.clinicId));
    const [m] = await db
      .select({
        nombre: clinicMembers.name,
        email: clinicMembers.email,
        verificado: clinicMembers.emailVerifiedAt,
        envuelta: clinicMembers.wrappedClinicKey,
      })
      .from(clinicMembers)
      .where(eq(clinicMembers.id, s.memberId));
    return {
      ...s,
      nombre: m.nombre,
      correo: m.email,
      correoVerificado: !!m.verificado,
      /** La clave de la clínica sellada para este dispositivo, si otro administrador la entregó. */
      claveEnvuelta: m.envuelta ? m.envuelta.toString("base64") : null,
      clinica: {
        nombre: c.name,
        pais: c.country,
        /** Solo cuando está verificado: un dominio sin verificar no dice nada. */
        dominio: c.domainVerifiedAt ? c.domain : null,
        verificada: !!c.domainVerifiedAt,
        direccion: c.address,
        /** Para comprobar, al recuperar la clave con el código en papel, que es la de esta clínica. */
        pubKey: c.pubKey.toString("base64"),
      },
    };
  });

  /* ── Equipo ─────────────────────────────────────────────── */

  app.get("/clinics/v1/members", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    const filas = await db
      .select({
        id: clinicMembers.id,
        nombre: clinicMembers.name,
        email: clinicMembers.email,
        rol: clinicMembers.role,
        aceptado: clinicMembers.acceptedAt,
        alta: clinicMembers.createdAt,
        devicePubKey: clinicMembers.devicePubKey,
        envuelta: clinicMembers.wrappedClinicKey,
      })
      .from(clinicMembers)
      .where(
        and(eq(clinicMembers.clinicId, s.clinicId), isNull(clinicMembers.revokedAt)),
      )
      .orderBy(clinicMembers.createdAt);

    /* Custodia de la clave: el primer administrador la tiene por su código en
       papel; los demás, cuando otro administrador se la entrega sellada. */
    const fundador = filas.find((f) => f.rol === "admin")?.id;
    return {
      miembros: filas.map(({ devicePubKey, envuelta, ...f }) => ({
        ...f,
        yo: f.id === s.memberId,
        custodia:
          f.rol !== "admin" ? null
          : f.id === fundador ? "codigo"
          : envuelta ? "entregada"
          : f.aceptado ? "pendiente"
          : "sin-aceptar",
        /** Para sellarle la clave: solo la ve un administrador. */
        devicePubKey: s.role === "admin" && devicePubKey ? devicePubKey.toString("base64") : null,
      })),
    };
  });

  /** Solo un administrador invita: es quien custodia la clave de la clínica. */
  app.post("/clinics/v1/members", { config: { rateLimit: limitePorIp(20) } }, async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    if (s.role !== "admin")
      return reply.code(403).send({ error: "solo un administrador invita" });
    if (!exigirActiva(s, reply)) return;

    const parsed = memberInviteBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const { token, hash } = nuevoToken();
    /* Cada invitación es un correo a una dirección cualquiera: tope diario por
       clínica, además del límite por IP. */
    const [{ n }] = await db
      .select({ n: count() })
      .from(clinicMembers)
      .where(and(eq(clinicMembers.clinicId, s.clinicId), gt(clinicMembers.createdAt, new Date(Date.now() - 864e5))));
    if (n >= INVITACIONES_POR_DIA)
      return reply.code(429).send({ error: "demasiadas invitaciones hoy", motivo: "tope-diario" });

    await purgarSinVerificar();
    let m: typeof clinicMembers.$inferSelect;
    try {
      [m] = await db
        .insert(clinicMembers)
        .values({
          clinicId: s.clinicId,
          name: parsed.data.nombre,
          email: parsed.data.email.toLowerCase(),
          role: parsed.data.rol,
          inviteTokenHash: hash,
          inviteExpiresAt: new Date(Date.now() + INVITACION_VIGENCIA_MS),
        })
        .returning();
    } catch (e) {
      // El correo ya está en otra cuenta: el índice único decide.
      if ((e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505")
        return reply.code(409).send({ error: "ese correo ya tiene cuenta", motivo: "correo-en-uso" });
      throw e;
    }

    /* La invitación viaja por correo: aceptarla demuestra que la persona
       controla ese buzón. El token no vuelve al administrador. */
    const [c] = await db.select({ name: clinics.name }).from(clinics).where(eq(clinics.id, s.clinicId));
    const enlace = `${env.clinicWebUrl}/aceptar?t=${encodeURIComponent(token)}`;
    const ROL: Record<string, string> = { admin: "administrador", vet: "veterinario", assistant: "auxiliar" };
    try {
      await enviarCorreo({
        para: m.email,
        // El asunto no lleva el nombre de la clínica: lo escribe quien se registra.
        asunto: "Te han invitado a Bark & Meow",
        texto: [
          `Hola, ${m.name}:`,
          "",
          `${c.name} te ha dado de alta en Bark & Meow como ${ROL[m.role]}.`,
          "Para aceptar y elegir tu contraseña, abre este enlace:",
          "",
          `    ${enlace}`,
          "",
          "Si no esperabas esta invitación, ignora este correo: sin aceptarla no se activa nada.",
        ].join("\n"),
      });
    } catch {
      return reply.code(502).send({ error: "no se pudo enviar la invitación", motivo: "envio", memberId: m.id });
    }
    return reply.code(201).send({ memberId: m.id, enviado: true });
  });

  /** Entrega la clave de la clínica, sellada en el navegador, a otro administrador. */
  app.post("/clinics/v1/members/:id/clinic-key", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    if (s.role !== "admin") return reply.code(403).send({ error: "solo un administrador entrega la clave" });
    if (!exigirActiva(s, reply)) return;
    const cuerpo = clinicKeyBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const { id } = req.params as { id: string };
    const [m] = await db
      .select()
      .from(clinicMembers)
      .where(and(eq(clinicMembers.id, id), eq(clinicMembers.clinicId, s.clinicId)))
      .limit(1);
    if (!m || m.revokedAt) return reply.code(404).send({ error: "no encontrado" });
    if (m.role !== "admin")
      return reply.code(400).send({ error: "solo los administradores custodian la clave", motivo: "no-admin" });
    if (!m.acceptedAt || !m.devicePubKey)
      return reply.code(409).send({ error: "aún no ha aceptado la invitación", motivo: "sin-aceptar" });

    await db
      .update(clinicMembers)
      .set({ wrappedClinicKey: Buffer.from(cuerpo.data.wrappedClinicKey, "base64") })
      .where(eq(clinicMembers.id, m.id));
    return { ok: true };
  });

  app.post("/clinics/v1/members/accept", async (req, reply) => {
    const parsed = memberAcceptBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const b = parsed.data;

    const filas = await db
      .select()
      .from(clinicMembers)
      .where(eq(clinicMembers.inviteTokenHash, hashToken(b.token)))
      .limit(1);
    const m = filas[0];
    const caducada = !!m?.inviteExpiresAt && m.inviteExpiresAt < new Date();
    if (!m || m.acceptedAt || m.revokedAt || caducada)
      return reply.code(400).send({ error: "invitación no válida" });

    await db
      .update(clinicMembers)
      .set({
        passwordHash: await hashPassword(b.password),
        devicePubKey: Buffer.from(b.devicePubKey, "base64"),
        wrappedClinicKey:
          m.role === "admin" && b.wrappedClinicKey
            ? Buffer.from(b.wrappedClinicKey, "base64")
            : null,
        inviteTokenHash: null,
        acceptedAt: new Date(),
        // La invitación llegó por correo: aceptarla confirma el buzón.
        emailVerifiedAt: new Date(),
      })
      .where(eq(clinicMembers.id, m.id));

    const { token } = await abrirSesion(m.id);
    reply.setCookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: env.sessionDays * 86400,
    });
    return { memberId: m.id, clinicId: m.clinicId, role: m.role };
  });

  /** Dar de baja borra la envoltura y mata sus sesiones. Lo descargado no vuelve. */
  app.delete("/clinics/v1/members/:id", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    if (s.role !== "admin")
      return reply.code(403).send({ error: "solo un administrador da de baja" });

    const { id } = req.params as { id: string };
    if (id === s.memberId)
      return reply.code(400).send({ error: "no puedes darte de baja a ti mismo" });

    const r = await db
      .update(clinicMembers)
      .set({ revokedAt: new Date(), wrappedClinicKey: null, devicePubKey: null })
      .where(and(eq(clinicMembers.id, id), eq(clinicMembers.clinicId, s.clinicId)))
      .returning({ id: clinicMembers.id });
    if (!r.length) return reply.code(404).send({ error: "no encontrado" });

    await db.delete(clinicSessions).where(eq(clinicSessions.memberId, id));
    return { ok: true, descargadoNoVuelve: true };
  });

  /* ── Borradores ─────────────────────────────────────────── */

  app.post("/clinics/v1/drafts", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    if (!exigirActiva(s, reply)) return;

    const parsed = draftCreateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const [d] = await db
      .insert(drafts)
      .values({
        clinicId: s.clinicId,
        species: parsed.data.especie,
        sealed: Buffer.from(parsed.data.sealed, "base64"),
        expiresAt: new Date(Date.now() + 90 * 864e5),
      })
      .returning({ id: drafts.id, expiresAt: drafts.expiresAt });

    return reply.code(201).send({ draftId: d.id, caduca: d.expiresAt });
  });

  app.get("/clinics/v1/drafts", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    const filas = await db
      .select({
        id: drafts.id,
        especie: drafts.species,
        caduca: drafts.expiresAt,
        reclamado: drafts.claimedByPetId,
      })
      .from(drafts)
      .where(eq(drafts.clinicId, s.clinicId));
    return { borradores: filas, total: filas.length };
  });
}
