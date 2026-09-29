import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, count, desc, eq, gt, isNull, or } from "drizzle-orm";
import { clinicApiKeys, clinics, envios, grants, inbox, petIdentifiers, pets } from "@barkandmeow/db";
import { apiKeyCreateBody, informeBody, normalizarChip, pacienteBuscarBody } from "@barkandmeow/schema";
import { db, hashToken, indexar } from "../core.js";
import { sesionDe } from "./clinics.js";

/* Software de gestión conectado por API (decidido 2026-09-29).

   Un administrador crea una clave; el software de la clínica la usa como
   `Authorization: Bearer bmk_…` para enviar informes a los dueños que les
   dieron el nivel 3. El informe se sella en el software de la clínica para la
   clave pública del dueño (crypto_box_seal de libsodium) y el servidor lo
   deja en su bandeja sin poder abrirlo. La clave no abre ninguna ficha: con
   ella no se lee nada, solo se entrega. */

const PREFIJO = "bmk_";
const TOKEN_RE = /^Bearer (bmk_[A-Za-z0-9_-]{43})$/;
const CLAVES_MAX = Number(process.env.LIMITE_CLAVES_API ?? 10);
const ENVIOS_LISTA = 50;

type Clave = { id: string; clinicId: string; nombre: string };

async function buscarClave(req: FastifyRequest): Promise<Clave | null> {
  const m = TOKEN_RE.exec(req.headers.authorization ?? "");
  if (!m) return null;
  const [k] = await db
    .select({ id: clinicApiKeys.id, clinicId: clinicApiKeys.clinicId, nombre: clinicApiKeys.nombre })
    .from(clinicApiKeys)
    .where(and(eq(clinicApiKeys.tokenHash, hashToken(m[1])), isNull(clinicApiKeys.revokedAt)))
    .limit(1);
  return k ?? null;
}

/** El id de la clave viva, para el límite por clave. No cuenta como uso. */
export const idDeClave = async (req: FastifyRequest) => (await buscarClave(req))?.id ?? null;

/** La clave de API de la cabecera Authorization, si está viva. */
async function claveDe(req: FastifyRequest): Promise<Clave | null> {
  const k = await buscarClave(req);
  if (!k) return null;
  await db.update(clinicApiKeys).set({ ultimoUso: new Date() }).where(eq(clinicApiKeys.id, k.id));
  return k;
}

async function exigirClave(req: FastifyRequest, reply: FastifyReply): Promise<Clave | null> {
  const k = await claveDe(req);
  if (!k) {
    reply.code(401).send({ error: "clave de API no válida o retirada", motivo: "sin-clave" });
    return null;
  }
  return k;
}

/** Nivel 3 vivo de esta clínica sobre una mascota activa. */
const permisoVivo = (clinicId: string) =>
  and(
    eq(grants.clinicId, clinicId),
    eq(grants.level, 3),
    isNull(grants.revokedAt),
    or(isNull(grants.expiresAt), gt(grants.expiresAt, new Date())),
    eq(pets.estado, "activa"),
  );

const b64 = (b: Buffer) => b.toString("base64");

/** Lo que usa el software de gestión, con su clave de API. */
export async function rutasApiSoftware(app: FastifyInstance) {
  /** Para comprobar la clave al configurar el software. */
  app.get("/clinics/v1/api/me", async (req, reply) => {
    const k = await exigirClave(req, reply);
    if (!k) return;
    const [c] = await db
      .select({ nombre: clinics.name, dominio: clinics.domain, verificada: clinics.domainVerifiedAt })
      .from(clinics)
      .where(eq(clinics.id, k.clinicId));
    return {
      clave: k.nombre,
      clinica: { nombre: c.nombre, dominio: c.verificada ? c.dominio : null, verificada: !!c.verificada },
    };
  });

  /** Pacientes con nivel 3 vivo: a quién se le puede enviar y a qué clave sellar. */
  app.get("/clinics/v1/api/patients", async (req, reply) => {
    const k = await exigirClave(req, reply);
    if (!k) return;
    const filas = await db
      .selectDistinctOn([pets.id], {
        petId: pets.id,
        ownerPubKey: pets.ownerPubKey,
        chipPista: pets.chipPista,
        desde: grants.createdAt,
      })
      .from(grants)
      .innerJoin(pets, eq(pets.id, grants.petId))
      .where(permisoVivo(k.clinicId))
      .orderBy(pets.id, grants.createdAt);
    return {
      pacientes: filas.map((f) => ({ ...f, ownerPubKey: b64(f.ownerPubKey) })),
    };
  });

  /**
   * El paciente de un chip que el software ya tiene en su ficha. Solo entre
   * los que tienen nivel 3 con esta clínica: fuera de ellos responde 404, sin
   * decir si el chip existe, así que no sirve para recorrer números.
   */
  app.post("/clinics/v1/api/patients/search", async (req, reply) => {
    const k = await exigirClave(req, reply);
    if (!k) return;
    const cuerpo = pacienteBuscarBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const [idx] = await indexar([normalizarChip(cuerpo.data.identificador.valor)]);
    const [f] = await db
      .select({ petId: pets.id, ownerPubKey: pets.ownerPubKey, chipPista: pets.chipPista })
      .from(petIdentifiers)
      .innerJoin(pets, eq(pets.id, petIdentifiers.petId))
      .innerJoin(grants, eq(grants.petId, pets.id))
      .where(and(eq(petIdentifiers.idIndex, idx), eq(petIdentifiers.activo, true), permisoVivo(k.clinicId)))
      .limit(1);
    if (!f) return reply.code(404).send({ error: "sin permiso de nivel 3 para ese chip", motivo: "sin-permiso" });
    return { ...f, ownerPubKey: b64(f.ownerPubKey) };
  });

  /** Enviar un informe sellado a la bandeja del dueño. */
  app.post("/clinics/v1/reports", async (req, reply) => {
    const k = await exigirClave(req, reply);
    if (!k) return;
    const cuerpo = informeBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const [p] = await db
      .select({ petId: pets.id })
      .from(grants)
      .innerJoin(pets, eq(pets.id, grants.petId))
      .where(and(eq(grants.petId, cuerpo.data.petId), permisoVivo(k.clinicId)))
      .limit(1);
    // Misma respuesta si la mascota no existe o el dueño retiró el permiso.
    if (!p) return reply.code(404).send({ error: "sin permiso de nivel 3 para esa mascota", motivo: "sin-permiso" });

    const sellado = Buffer.from(cuerpo.data.sellado, "base64");
    const [e] = await db.transaction(async (tx) => {
      await tx.insert(inbox).values({ petId: p.petId, sealed: sellado, clinicId: k.clinicId, apiKeyId: k.id });
      return tx
        .insert(envios)
        .values({ clinicId: k.clinicId, apiKeyId: k.id, petId: p.petId, bytes: sellado.length })
        .returning({ id: envios.id, fecha: envios.createdAt });
    });
    return reply.code(201).send({ envioId: e.id, fecha: e.fecha });
  });
}

/** Lo que usa la consola de la clínica, con la sesión de un miembro. */
export async function rutasSoftware(app: FastifyInstance) {
  /** Claves y su último uso. Cualquier miembro ve el estado; el token, nadie. */
  app.get("/clinics/v1/api-keys", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    const claves = await db
      .select({
        id: clinicApiKeys.id,
        nombre: clinicApiKeys.nombre,
        prefijo: clinicApiKeys.prefijo,
        creada: clinicApiKeys.createdAt,
        ultimoUso: clinicApiKeys.ultimoUso,
        firmaPub: clinicApiKeys.firmaPub,
      })
      .from(clinicApiKeys)
      .where(and(eq(clinicApiKeys.clinicId, s.clinicId), isNull(clinicApiKeys.revokedAt)))
      .orderBy(clinicApiKeys.createdAt);
    return {
      claves: claves.map(({ firmaPub, ...k }) => ({
        ...k,
        /** Sin clave de firma (creada antes de las firmas): sus envíos no se pueden certificar. */
        firma: firmaPub ? firmaPub.toString("base64") : null,
      })),
    };
  });

  /** Solo un administrador crea claves. El token sale una vez y no se guarda. */
  app.post("/clinics/v1/api-keys", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    if (s.role !== "admin") return reply.code(403).send({ error: "solo un administrador crea claves" });
    if (!s.clinicaActiva)
      return reply.code(403).send({ error: "verifica el correo de la clínica primero", motivo: "correo-sin-verificar" });
    const cuerpo = apiKeyCreateBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const [{ n }] = await db
      .select({ n: count() })
      .from(clinicApiKeys)
      .where(and(eq(clinicApiKeys.clinicId, s.clinicId), isNull(clinicApiKeys.revokedAt)));
    if (n >= CLAVES_MAX)
      return reply.code(409).send({ error: "demasiadas claves: retira alguna", motivo: "tope-claves" });

    const token = PREFIJO + randomBytes(32).toString("base64url");
    const [k] = await db
      .insert(clinicApiKeys)
      .values({
        clinicId: s.clinicId,
        nombre: cuerpo.data.nombre,
        tokenHash: hashToken(token),
        prefijo: token.slice(0, PREFIJO.length + 6),
        firmaPub: Buffer.from(cuerpo.data.firmaPub, "base64"),
        creadaPor: s.memberId,
      })
      .returning({ id: clinicApiKeys.id, prefijo: clinicApiKeys.prefijo });
    return reply.code(201).send({ id: k.id, prefijo: k.prefijo, token });
  });

  /** Retirar una clave: deja de valer al momento. Lo enviado sigue en las bandejas. */
  app.delete("/clinics/v1/api-keys/:id", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    if (s.role !== "admin") return reply.code(403).send({ error: "solo un administrador retira claves" });
    const { id } = req.params as { id: string };
    if (!/^[0-9a-f-]{36}$/.test(id)) return reply.code(404).send({ error: "no encontrada" });

    const r = await db
      .update(clinicApiKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(clinicApiKeys.id, id), eq(clinicApiKeys.clinicId, s.clinicId), isNull(clinicApiKeys.revokedAt)),
      )
      .returning({ id: clinicApiKeys.id });
    if (!r.length) return reply.code(404).send({ error: "no encontrada" });
    return { ok: true };
  });

  /** Registro de envíos: fecha, mascota y clave. Nunca el contenido. */
  app.get("/clinics/v1/reports", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    const filas = await db
      .select({
        id: envios.id,
        petId: envios.petId,
        chipPista: pets.chipPista,
        clave: clinicApiKeys.nombre,
        bytes: envios.bytes,
        fecha: envios.createdAt,
      })
      .from(envios)
      .innerJoin(pets, eq(pets.id, envios.petId))
      .leftJoin(clinicApiKeys, eq(clinicApiKeys.id, envios.apiKeyId))
      .where(eq(envios.clinicId, s.clinicId))
      .orderBy(desc(envios.createdAt))
      .limit(ENVIOS_LISTA);
    return { envios: filas };
  });
}
