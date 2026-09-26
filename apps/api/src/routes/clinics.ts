import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { clinicMembers, clinicSessions, clinics, drafts } from "@barkandmeow/db";
import {
  clinicRegisterBody,
  draftCreateBody,
  loginBody,
  memberAcceptBody,
  memberInviteBody,
} from "@barkandmeow/schema";
import {
  db,
  env,
  hashPassword,
  hashToken,
  nuevoToken,
  verificarPassword,
} from "../core.js";

export type Sesion = {
  memberId: string;
  clinicId: string;
  role: "admin" | "vet" | "assistant";
};

const COOKIE = "bam_clinic";

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
  return { memberId: s.memberId, clinicId: s.clinicId, role: s.role };
}

async function abrirSesion(memberId: string) {
  const { token, hash } = nuevoToken();
  const expiresAt = new Date(Date.now() + env.sessionDays * 864e5);
  await db.insert(clinicSessions).values({ memberId, tokenHash: hash, expiresAt });
  return { token, expiresAt };
}

export default async function rutasClinicas(app: FastifyInstance) {
  /** Alta de la clínica. Crea la organización y a su primer administrador. */
  app.post("/clinics/v1/register", async (req, reply) => {
    const parsed = clinicRegisterBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const b = parsed.data;

    const yaExiste = await db
      .select({ id: clinicMembers.id })
      .from(clinicMembers)
      .where(eq(clinicMembers.email, b.admin.email.toLowerCase()))
      .limit(1);
    if (yaExiste.length) return reply.code(409).send({ error: "correo ya usado" });

    const { token: domainToken } = nuevoToken();

    const [clinica] = await db
      .insert(clinics)
      .values({
        name: b.nombre,
        country: b.pais.toUpperCase(),
        healthRegistry: b.registroSanitario ?? null,
        domain: b.dominio?.toLowerCase() ?? null,
        domainToken: `barkandmeow-verify=${domainToken.slice(0, 16)}`,
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

    return reply.code(201).send({
      clinicId: clinica.id,
      memberId: miembro.id,
      /* La clínica no aparece como verificada hasta que este TXT esté en su DNS. */
      dnsTxt: clinica.domainToken,
      domainVerified: false,
    });
  });

  app.post("/clinics/v1/login", async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const filas = await db
      .select()
      .from(clinicMembers)
      .where(eq(clinicMembers.email, parsed.data.email.toLowerCase()))
      .limit(1);
    const m = filas[0];

    const ok =
      !!m && !m.revokedAt && (await verificarPassword(parsed.data.password, m.passwordHash));
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
  });

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
    return {
      ...s,
      clinica: {
        nombre: c.name,
        pais: c.country,
        dominio: c.domain,
        verificada: !!c.domainVerifiedAt,
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
      })
      .from(clinicMembers)
      .where(
        and(eq(clinicMembers.clinicId, s.clinicId), isNull(clinicMembers.revokedAt)),
      );
    return { miembros: filas };
  });

  /** Solo un administrador invita: es quien custodia la clave de la clínica. */
  app.post("/clinics/v1/members", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    if (s.role !== "admin")
      return reply.code(403).send({ error: "solo un administrador invita" });

    const parsed = memberInviteBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const { token, hash } = nuevoToken();
    const [m] = await db
      .insert(clinicMembers)
      .values({
        clinicId: s.clinicId,
        name: parsed.data.nombre,
        email: parsed.data.email.toLowerCase(),
        role: parsed.data.rol,
        inviteTokenHash: hash,
      })
      .returning();

    return reply.code(201).send({ memberId: m.id, inviteToken: token });
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
    if (!m || m.acceptedAt || m.revokedAt)
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
