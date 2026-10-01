import type { FastifyInstance } from "fastify";
import { and, eq, ne, sql } from "drizzle-orm";
import { blobs } from "@barkandmeow/db";
import { fichaBody, placaBody } from "@barkandmeow/schema";
import { db } from "../core.js";
import { duenoDe, mascotaDe } from "./duenos.js";

/* La ficha de salud del dueño y la placa del collar (decidido 2026-10-01).

   La ficha es un bloque cifrado en el navegador o en la app del dueño con la
   clave de esa mascota: aquí se guardan bytes y un número de versión, igual
   que el pasaporte de viaje.

   La placa es el resumen de emergencia (nivel 1), cifrado con la clave que va
   en el fragmento del QR. Lo entrega GET /e/v1/:id a quien escanee la placa,
   que lo descifra en su navegador. El dueño lo vuelve a subir cada vez que
   cambia la ficha; si pierde la placa, la sustituye por otra con otro id y
   otra clave, y la vieja deja de responder al momento. */

const unico = (e: unknown) =>
  (e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505";

export default async function rutasSalud(app: FastifyInstance) {
  /** La ficha cifrada, o null si aún no hay. */
  app.get("/owners/v1/pets/:id/record", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const p = await mascotaDe(d, (req.params as { id: string }).id, reply);
    if (!p) return;
    const [b] = await db
      .select({ sealed: blobs.sealed, version: blobs.version })
      .from(blobs)
      .where(and(eq(blobs.petId, p.id), eq(blobs.kind, "record")))
      .limit(1);
    reply.header("cache-control", "no-store");
    return { sobre: b?.sealed ? b.sealed.toString("base64") : null, version: b?.version ?? 0 };
  });

  /**
   * Guarda la ficha. `version` es la que el cliente leyó: si otro la guardó
   * entre medias (el portal y la app a la vez), 409 y se vuelve a leer.
   */
  app.put("/owners/v1/pets/:id/record", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const p = await mascotaDe(d, (req.params as { id: string }).id, reply);
    if (!p) return;
    const cuerpo = fichaBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const sobre = Buffer.from(cuerpo.data.sobre, "base64");
    const leida = cuerpo.data.version;

    if (leida === 0) {
      try {
        await db.insert(blobs).values({ petId: p.id, kind: "record", sealed: sobre, version: 1 });
      } catch (e) {
        if (unico(e)) return reply.code(409).send({ error: "la ficha cambió en otro sitio", motivo: "version" });
        throw e;
      }
      return { version: 1 };
    }

    const r = await db
      .update(blobs)
      .set({ sealed: sobre, version: leida + 1 })
      .where(and(eq(blobs.petId, p.id), eq(blobs.kind, "record"), eq(blobs.version, leida)))
      .returning({ version: blobs.version });
    if (!r.length) return reply.code(409).send({ error: "la ficha cambió en otro sitio", motivo: "version" });
    return { version: r[0].version };
  });

  /**
   * Pone la placa o actualiza su resumen. Con el mismo id se actualiza; con
   * otro id la placa anterior se borra: una mascota tiene una sola placa viva.
   */
  app.put("/owners/v1/pets/:id/tag", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const p = await mascotaDe(d, (req.params as { id: string }).id, reply);
    if (!p) return;
    const cuerpo = placaBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const sobre = Buffer.from(cuerpo.data.sobre, "base64");

    const actualizada = await db
      .update(blobs)
      .set({ sealed: sobre, version: sql`${blobs.version} + 1` })
      .where(and(eq(blobs.id, cuerpo.data.id), eq(blobs.petId, p.id), eq(blobs.kind, "emergency")))
      .returning({ version: blobs.version });
    if (actualizada.length) return { id: cuerpo.data.id, version: actualizada[0].version };

    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(blobs)
          .where(and(eq(blobs.petId, p.id), eq(blobs.kind, "emergency"), ne(blobs.id, cuerpo.data.id)));
        await tx.insert(blobs).values({ id: cuerpo.data.id, petId: p.id, kind: "emergency", sealed: sobre, version: 1 });
      });
    } catch (e) {
      // El id ya es de otro bloque (de otra mascota, o de otro tipo): no se pisa.
      if (unico(e)) return reply.code(409).send({ error: "ese id ya existe", motivo: "id" });
      throw e;
    }
    return { id: cuerpo.data.id, version: 1 };
  });

  /** Retira la placa: el QR deja de abrir nada al momento. */
  app.delete("/owners/v1/pets/:id/tag", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const p = await mascotaDe(d, (req.params as { id: string }).id, reply);
    if (!p) return;
    const r = await db
      .delete(blobs)
      .where(and(eq(blobs.petId, p.id), eq(blobs.kind, "emergency")))
      .returning({ id: blobs.id });
    if (!r.length) return reply.code(404).send({ error: "sin placa" });
    return { ok: true };
  });
}
