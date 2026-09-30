import type { FastifyInstance, FastifyReply } from "fastify";
import { and, eq, gt, ne } from "drizzle-orm";
import { z } from "zod";
import { blobs, inbox, petProfiles, pets } from "@barkandmeow/db";
import { avisoBody, notaBody } from "@barkandmeow/schema";
import { db, leerAviso } from "../core.js";
import { avisarPush } from "../push.js";
import { almacenActual, bytesDeFoto } from "../almacen.js";

/* Web del veterinario, niveles 1 y 2. El servidor entrega bloques que no puede
   abrir: la clave viaja en el fragmento `#` de la URL y nunca llega aquí. Lo
   único en claro es el perfil público, que el dueño publica a propósito. */

export type PerfilPublico = {
  /** Cómo se llama: quien lo encuentra puede llamarlo por su nombre. */
  nombre: string;
  bio: string;
  telefonos: { etiqueta: string; numero: string }[];
  /** Ruta relativa a la API, o null si no hay foto. */
  foto: string | null;
};

export async function perfilPublico(petId: string): Promise<PerfilPublico | null> {
  const [p] = await db
    .select({
      publicado: petProfiles.publicado,
      nombre: petProfiles.nombre,
      bio: petProfiles.bio,
      telefonos: petProfiles.telefonos,
      fotoId: petProfiles.fotoId,
    })
    .from(petProfiles)
    .innerJoin(pets, eq(pets.id, petProfiles.petId))
    // Con una reclamación abierta (congelada) el perfil no se muestra: sus
    // teléfonos podrían ser los de quien registró un chip ajeno.
    .where(and(eq(petProfiles.petId, petId), eq(pets.estado, "activa")))
    .limit(1);
  if (!p?.publicado) return null;
  return {
    nombre: p.nombre,
    bio: p.bio,
    telefonos: p.telefonos,
    foto: p.fotoId ? `/perfil/v1/foto/${p.fotoId}` : null,
  };
}

const id = z.object({ id: z.string().uuid() });
const idDoc = z.object({ id: z.string().uuid(), docId: z.string().uuid() });

/** El bloque sellado: en Postgres (`sealed`) o, si ya se mudó, en el almacén (`s3Key`). */
async function contenido(b: { sealed: Buffer | null; s3Key: string | null }) {
  if (b.sealed) return b.sealed;
  return b.s3Key ? almacenActual().leer(b.s3Key) : null;
}

/** La copia temporal viva, o la respuesta que toca si no lo está. */
async function copiaViva(shareId: string, reply: FastifyReply) {
  const [b] = await db
    .select({
      petId: blobs.petId,
      sealed: blobs.sealed,
      s3Key: blobs.s3Key,
      expiresAt: blobs.expiresAt,
      ownerPubKey: pets.ownerPubKey,
    })
    .from(blobs)
    .innerJoin(pets, eq(pets.id, blobs.petId))
    .where(and(eq(blobs.id, shareId), eq(blobs.kind, "share")))
    .limit(1);
  if (!b || (!b.sealed && !b.s3Key)) {
    reply.code(404).send({ error: "no existe" });
    return null;
  }
  // Caducada o revocada: revocar borra el bloque, caducar lo deja con fecha pasada.
  if (!b.expiresAt || b.expiresAt <= new Date()) {
    reply.code(410).send({ error: "acceso caducado o revocado" });
    return null;
  }
  const sobre = await contenido(b);
  if (!sobre) {
    reply.code(404).send({ error: "no existe" });
    return null;
  }
  return { ...b, sobre };
}

export default async function rutasFicha(app: FastifyInstance) {
  /** Nivel 1: el resumen de emergencia de una placa. */
  app.get("/e/v1/:id", async (req, reply) => {
    const p = id.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "no existe" });

    const [b] = await db
      .select({ petId: blobs.petId, sealed: blobs.sealed, s3Key: blobs.s3Key, version: blobs.version })
      .from(blobs)
      // Una ficha retirada perdió el chip en una reclamación: su placa deja de responder.
      .innerJoin(pets, eq(pets.id, blobs.petId))
      .where(and(eq(blobs.id, p.data.id), eq(blobs.kind, "emergency"), ne(pets.estado, "retirada")))
      .limit(1);
    const sobre = b ? await contenido(b) : null;
    if (!b || !sobre) return reply.code(404).send({ error: "no existe" });

    reply.header("cache-control", "no-store");
    return {
      sobre: sobre.toString("base64"),
      version: b.version,
      perfil: await perfilPublico(b.petId),
    };
  });

  /** Nivel 2: la copia temporal del historial, mientras no caduque. */
  app.get("/s/v1/:id", async (req, reply) => {
    const p = id.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "no existe" });
    const b = await copiaViva(p.data.id, reply);
    if (!b) return;

    reply.header("cache-control", "no-store");
    return {
      sobre: b.sobre.toString("base64"),
      caduca: b.expiresAt!.toISOString(),
      /** Para sellar la nota de la consulta: el veterinario escribe, no lee. */
      ownerPubKey: b.ownerPubKey.toString("base64"),
      perfil: await perfilPublico(b.petId),
    };
  });

  /** Documento original de un registro, cifrado con la misma clave temporal. */
  app.get("/s/v1/:id/doc/:docId", async (req, reply) => {
    const p = idDoc.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "no existe" });
    const copia = await copiaViva(p.data.id, reply);
    if (!copia) return;

    const [d] = await db
      .select({ sealed: blobs.sealed, s3Key: blobs.s3Key })
      .from(blobs)
      .where(
        and(
          eq(blobs.id, p.data.docId),
          eq(blobs.kind, "document"),
          eq(blobs.petId, copia.petId),
          gt(blobs.expiresAt, new Date()),
        ),
      )
      .limit(1);
    const doc = d ? await contenido(d) : null;
    if (!doc) return reply.code(404).send({ error: "no existe" });

    reply.header("cache-control", "no-store");
    reply.header("content-type", "application/octet-stream");
    return reply.send(doc);
  });

  /** Nota de la consulta, sellada para el dueño en el navegador del veterinario. */
  app.post("/s/v1/:id/nota", async (req, reply) => {
    const p = id.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "no existe" });
    const cuerpo = notaBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const copia = await copiaViva(p.data.id, reply);
    if (!copia) return;

    await db.insert(inbox).values({
      petId: copia.petId,
      sealed: Buffer.from(cuerpo.data.sellado, "base64"),
    });
    await avisarPush({ tipo: "bandeja", petId: copia.petId }, req.log);
    return reply.code(201).send({ ok: true });
  });

  /**
   * Nivel 0: avisar al dueño. Responde igual con token real o con señuelo, así
   * que no confirma si el chip existe. El aviso va sellado para el dueño, que
   * recibe un push en su móvil si tiene la app. El push sale sin esperar
   * respuesta: si la petición tardara más con token real, delataría el chip.
   */
  app.post("/chip/v1/notify", async (req, reply) => {
    const cuerpo = avisoBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const petId = leerAviso(cuerpo.data.aviso);
    if (petId) {
      await db.insert(inbox).values({
        petId,
        sealed: Buffer.from(cuerpo.data.sellado, "base64"),
      });
      void avisarPush({ tipo: "bandeja", petId }, req.log);
    }
    return reply.code(202).send({ recibido: true });
  });

  /** Foto del perfil público. Solo si el dueño lo ha publicado. */
  app.get("/perfil/v1/foto/:id", async (req, reply) => {
    const p = id.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "no existe" });

    const [f] = await db
      .select({
        foto: petProfiles.foto,
        fotoKey: petProfiles.fotoKey,
        tipo: petProfiles.fotoTipo,
        publicado: petProfiles.publicado,
      })
      .from(petProfiles)
      .innerJoin(pets, eq(pets.id, petProfiles.petId))
      .where(and(eq(petProfiles.fotoId, p.data.id), eq(pets.estado, "activa")))
      .limit(1);
    if (!f?.publicado || !f.tipo) return reply.code(404).send({ error: "no existe" });
    const bytes = await bytesDeFoto(f);
    if (!bytes) return reply.code(404).send({ error: "no existe" });

    reply.header("content-type", f.tipo);
    // El id cambia con cada foto nueva: la URL puede cachearse sin miedo.
    reply.header("cache-control", "public, max-age=86400, immutable");
    reply.header("x-content-type-options", "nosniff");
    return reply.send(bytes);
  });
}
