import type { FastifyInstance } from "fastify";
import { and, desc, eq, gt } from "drizzle-orm";
import { blobs, clinicApiKeys, clinics } from "@barkandmeow/db";
import { compartirBody, pasaporteBody } from "@barkandmeow/schema";
import { db } from "../core.js";
import { duenoDe, mascotaDe } from "./duenos.js";

/* Pasaporte de viaje (decidido 2026-09-29).

   El pasaporte del dueño es un bloque cifrado en su navegador con una clave
   que sale de su código en papel: el servidor guarda bytes y un número de
   versión. Para un viaje, el dueño lo comparte con un enlace temporal cifrado
   con la clave del fragmento, igual que la copia del historial (nivel 2): el
   veterinario de frontera lo abre en la web del veterinario y comprueba las
   firmas de las clínicas contra el directorio público de claves de firma. */

const ENLACES_VIVOS = 10;

export default async function rutasPasaporte(app: FastifyInstance) {
  /** El pasaporte cifrado, o null si aún no hay. */
  app.get("/owners/v1/pets/:id/passport", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const p = await mascotaDe(d, (req.params as { id: string }).id, reply);
    if (!p) return;
    const [b] = await db
      .select({ sealed: blobs.sealed, version: blobs.version })
      .from(blobs)
      .where(and(eq(blobs.petId, p.id), eq(blobs.kind, "passport")))
      .limit(1);
    reply.header("cache-control", "no-store");
    return { sobre: b?.sealed ? b.sealed.toString("base64") : null, version: b?.version ?? 0 };
  });

  /**
   * Guarda el pasaporte. `version` es la que el navegador leyó: si otro
   * navegador guardó entre medias, 409 y se vuelve a leer, en vez de pisarlo.
   */
  app.put("/owners/v1/pets/:id/passport", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const p = await mascotaDe(d, (req.params as { id: string }).id, reply);
    if (!p) return;
    const cuerpo = pasaporteBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const sobre = Buffer.from(cuerpo.data.sobre, "base64");
    const leida = cuerpo.data.version;

    if (leida === 0) {
      try {
        await db.insert(blobs).values({ petId: p.id, kind: "passport", sealed: sobre, version: 1 });
      } catch (e) {
        // El índice único dice que otro navegador lo creó antes.
        if ((e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505")
          return reply.code(409).send({ error: "el pasaporte cambió en otro sitio", motivo: "version" });
        throw e;
      }
      return { version: 1 };
    }

    const r = await db
      .update(blobs)
      .set({ sealed: sobre, version: leida + 1 })
      .where(and(eq(blobs.petId, p.id), eq(blobs.kind, "passport"), eq(blobs.version, leida)))
      .returning({ version: blobs.version });
    if (!r.length) return reply.code(409).send({ error: "el pasaporte cambió en otro sitio", motivo: "version" });
    return { version: r[0].version };
  });

  /** Enlaces de viaje vivos de una mascota. */
  app.get("/owners/v1/pets/:id/shares", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const p = await mascotaDe(d, (req.params as { id: string }).id, reply);
    if (!p) return;
    const filas = await db
      .select({ id: blobs.id, caduca: blobs.expiresAt, creado: blobs.createdAt })
      .from(blobs)
      .where(and(eq(blobs.petId, p.id), eq(blobs.kind, "share"), gt(blobs.expiresAt, new Date())))
      .orderBy(desc(blobs.createdAt));
    return { enlaces: filas };
  });

  /**
   * Nuevo enlace temporal. El id lo elige el navegador: el cifrado va atado a
   * él, y así la clave no tiene que esperar a la respuesta del servidor.
   */
  app.post("/owners/v1/pets/:id/shares", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const p = await mascotaDe(d, (req.params as { id: string }).id, reply);
    if (!p) return;
    const cuerpo = compartirBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const vivos = await db
      .select({ id: blobs.id })
      .from(blobs)
      .where(and(eq(blobs.petId, p.id), eq(blobs.kind, "share"), gt(blobs.expiresAt, new Date())));
    if (vivos.length >= ENLACES_VIVOS)
      return reply.code(409).send({ error: "demasiados enlaces vivos: retira alguno", motivo: "tope-enlaces" });

    const caduca = new Date(Date.now() + cuerpo.data.horas * 3600_000);
    try {
      await db.insert(blobs).values({
        id: cuerpo.data.id,
        petId: p.id,
        kind: "share",
        sealed: Buffer.from(cuerpo.data.sobre, "base64"),
        expiresAt: caduca,
      });
    } catch (e) {
      if ((e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505")
        return reply.code(409).send({ error: "ese id ya existe", motivo: "id" });
      throw e;
    }
    return reply.code(201).send({ id: cuerpo.data.id, caduca });
  });

  /** Retirar un enlace borra el bloque: deja de abrirse al momento. */
  app.delete("/owners/v1/pets/:id/shares/:shareId", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const { id, shareId } = req.params as { id: string; shareId: string };
    const p = await mascotaDe(d, id, reply);
    if (!p) return;
    if (!/^[0-9a-f-]{36}$/.test(shareId)) return reply.code(404).send({ error: "no encontrado" });
    const r = await db
      .delete(blobs)
      .where(and(eq(blobs.id, shareId), eq(blobs.petId, p.id), eq(blobs.kind, "share")))
      .returning({ id: blobs.id });
    if (!r.length) return reply.code(404).send({ error: "no encontrado" });
    return { ok: true, descargadoNoVuelve: true };
  });
}

/**
 * Directorio público de claves de firma: de qué clínica es una clave. Lo
 * consulta quien recibe un pasaporte compartido para saber quién firmó cada
 * registro. Una clave retirada sigue aquí, con su fecha: lo firmado antes de
 * retirarla sigue valiendo.
 */
export async function rutasFirmas(app: FastifyInstance) {
  app.get("/firmas/v1/:clave", async (req, reply) => {
    const { clave } = req.params as { clave: string };
    if (!/^[A-Za-z0-9_-]{43}$/.test(clave)) return reply.code(404).send({ error: "no existe" });
    const pub = Buffer.from(clave, "base64url");
    const [k] = await db
      .select({
        clinica: clinics.name,
        pais: clinics.country,
        dominio: clinics.domain,
        verificada: clinics.domainVerifiedAt,
        alta: clinicApiKeys.createdAt,
        retirada: clinicApiKeys.revokedAt,
      })
      .from(clinicApiKeys)
      .innerJoin(clinics, eq(clinics.id, clinicApiKeys.clinicId))
      .where(eq(clinicApiKeys.firmaPub, pub))
      .limit(1);
    if (!k) return reply.code(404).send({ error: "no existe" });
    reply.header("cache-control", "public, max-age=300");
    return {
      clinica: k.clinica,
      pais: k.pais,
      dominio: k.verificada ? k.dominio : null,
      verificada: !!k.verificada,
      alta: k.alta,
      retirada: k.retirada,
    };
  });
}
