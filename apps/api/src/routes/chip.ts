import { randomInt, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, eq, gt, lt } from "drizzle-orm";
import { accessLog, grantRequests, grants, petIdentifiers, pets } from "@barkandmeow/db";
import {
  chipLookupBody,
  grantApproveBody,
  grantRequestBody,
  grantRevokeBody,
  normalizarChip,
  origenChip,
} from "@barkandmeow/schema";
import { db, env, gastarPresupuesto, indexar, numeroComparacion } from "../core.js";
import { sesionDe } from "./clinics.js";

/** La petición de alta caduca pronto: el número está en pantalla mientras tanto. */
const VENTANA_MS = 10 * 60 * 1000;

/* TLS oculta el contenido pero no el tamaño del paquete. Si la respuesta del
   nivel 0 fuese más larga cuando hay ficha, un observador de red sabría qué
   chips existen sin descifrar nada. Todas las respuestas se rellenan al mismo
   tamaño, y cuando no hay ficha van señuelos con la forma correcta. */
const RESPUESTA_BYTES = 512;

function padear<T extends Record<string, unknown>>(obj: T) {
  const sinPad = JSON.stringify({ ...obj, pad: "" });
  const falta = Math.max(0, RESPUESTA_BYTES - Buffer.byteLength(sinPad));
  return { ...obj, pad: "-".repeat(falta) };
}

const uuidSenuelo = () => randomUUID();
const sasSenuelo = () =>
  String(randomInt(0, 1_000_000)).padStart(6, "0");

export default async function rutasChip(app: FastifyInstance) {
  /**
   * Nivel 0. Responde lo mismo en forma, tamaño y tiempo exista o no la ficha.
   * Si el veterinario manda su clave pública y hay sesión de clínica, abre de
   * paso la petición de alta y devuelve el número de comparación.
   */
  app.post("/chip/v1/lookup", async (req, reply) => {
    const t0 = Date.now();
    const parsed = chipLookupBody.safeParse(req.body);
    if (!parsed.success) {
      await gastarPresupuesto(t0, env.lookupBudgetMs);
      return reply.code(400).send({ error: "cuerpo inválido" });
    }

    const sesion = await sesionDe(req);
    const valor = normalizarChip(parsed.data.identificador.valor);
    const [idx] = await indexar([valor]);

    const filas = await db
      .select({ petId: pets.id, ownerPubKey: pets.ownerPubKey })
      .from(petIdentifiers)
      .innerJoin(pets, eq(pets.id, petIdentifiers.petId))
      .where(eq(petIdentifiers.idIndex, idx))
      .limit(1);

    const encontrado = filas[0] ?? null;

    await db.insert(accessLog).values({
      clinicId: sesion?.clinicId ?? null,
      action: "chip_lookup",
      found: encontrado ? "yes" : "no",
    });

    /* Señuelos por defecto: misma forma y mismo tamaño que los de verdad.
       Quien recibe la respuesta ya sabe si existe por `existe`; quien solo mira
       el tráfico, no. */
    let requestId: string = uuidSenuelo();
    let sas: string = sasSenuelo();

    if (encontrado && sesion && parsed.data.vetPubKey) {
      const vetPubKey = Buffer.from(parsed.data.vetPubKey, "base64");
      const [peticion] = await db
        .insert(grantRequests)
        .values({
          petId: encontrado.petId,
          clinicId: sesion.clinicId,
          vetPubKey,
          expiresAt: new Date(Date.now() + VENTANA_MS),
        })
        .returning({ id: grantRequests.id });
      requestId = peticion.id;
      sas = numeroComparacion(vetPubKey, encontrado.ownerPubKey, requestId);
    }

    const o = origenChip(valor);
    const origen = {
      clase: parsed.data.identificador.tipo === 'iso' ? o.clase : 'no-iso',
      codigo: parsed.data.identificador.tipo === 'iso' ? o.codigo : '000',
      iso2: o.clase === 'pais' ? o.iso2 : null,
    };

    /* El presupuesto de tiempo se gasta entero, haya ficha o no. */
    await gastarPresupuesto(t0, env.lookupBudgetMs);

    return reply.send(
      padear({ existe: !!encontrado, origen, requestId, sas }),
    );
  });

  /** Alta de nivel 3 pedida explícitamente, sin pasar por el lookup. */
  app.post("/grants/v1/request", async (req, reply) => {
    const sesion = await sesionDe(req);
    if (!sesion) return reply.code(401).send({ error: "sin sesión" });

    const parsed = grantRequestBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const t0 = Date.now();
    const valor = normalizarChip(parsed.data.identificador.valor);
    const [idx] = await indexar([valor]);

    const filas = await db
      .select({ petId: pets.id, ownerPubKey: pets.ownerPubKey })
      .from(petIdentifiers)
      .innerJoin(pets, eq(pets.id, petIdentifiers.petId))
      .where(eq(petIdentifiers.idIndex, idx))
      .limit(1);

    if (!filas.length) {
      await gastarPresupuesto(t0, env.lookupBudgetMs);
      return reply.code(404).send({ error: "sin ficha" });
    }

    const vetPubKey = Buffer.from(parsed.data.vetPubKey, "base64");
    const [peticion] = await db
      .insert(grantRequests)
      .values({
        petId: filas[0].petId,
        clinicId: sesion.clinicId,
        vetPubKey,
        expiresAt: new Date(Date.now() + VENTANA_MS),
      })
      .returning({ id: grantRequests.id, expiresAt: grantRequests.expiresAt });

    await gastarPresupuesto(t0, env.lookupBudgetMs);
    return reply.code(201).send({
      requestId: peticion.id,
      sas: numeroComparacion(vetPubKey, filas[0].ownerPubKey, peticion.id),
      caduca: peticion.expiresAt,
    });
  });

  app.get("/grants/v1/request/:id", async (req, reply) => {
    const sesion = await sesionDe(req);
    if (!sesion) return reply.code(401).send({ error: "sin sesión" });
    const { id } = req.params as { id: string };

    const filas = await db
      .select()
      .from(grantRequests)
      .where(
        and(eq(grantRequests.id, id), eq(grantRequests.clinicId, sesion.clinicId)),
      )
      .limit(1);
    if (!filas.length) return reply.code(404).send({ error: "no encontrada" });

    const p = filas[0];
    const estado =
      p.state === "pending" && p.expiresAt < new Date() ? "expired" : p.state;
    return { requestId: p.id, estado, caduca: p.expiresAt };
  });

  /**
   * La app del dueño aprueba: sube K envuelta para la clave del veterinario.
   * El servidor guarda bytes que no puede abrir.
   */
  app.post("/grants/v1/approve", async (req, reply) => {
    const parsed = grantApproveBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const filas = await db
      .select()
      .from(grantRequests)
      .where(
        and(
          eq(grantRequests.id, parsed.data.requestId),
          eq(grantRequests.state, "pending"),
          gt(grantRequests.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!filas.length)
      return reply.code(410).send({ error: "petición caducada o ya resuelta" });

    const p = filas[0];
    const [g] = await db
      .insert(grants)
      .values({
        petId: p.petId,
        clinicId: p.clinicId,
        level: 3,
        wrappedKey: Buffer.from(parsed.data.wrappedKey, "base64"),
      })
      .returning({ id: grants.id });

    await db
      .update(grantRequests)
      .set({ state: "approved" })
      .where(eq(grantRequests.id, p.id));

    return reply.code(201).send({ grantId: g.id, level: 3 });
  });

  app.post("/grants/v1/revoke", async (req, reply) => {
    const parsed = grantRevokeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const r = await db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.id, parsed.data.grantId))
      .returning({ id: grants.id });
    if (!r.length) return reply.code(404).send({ error: "no encontrado" });

    /* Honesto: borra la copia del servidor, no lo que ya se descargó. */
    return { ok: true, descargadoNoVuelve: true };
  });

  /** Lo que la clínica puede ver: sus permisos vivos. Nunca contenido. */
  app.get("/grants/v1/mine", async (req, reply) => {
    const sesion = await sesionDe(req);
    if (!sesion) return reply.code(401).send({ error: "sin sesión" });

    const filas = await db
      .select({
        id: grants.id,
        petId: grants.petId,
        level: grants.level,
        expiresAt: grants.expiresAt,
        revokedAt: grants.revokedAt,
      })
      .from(grants)
      .where(eq(grants.clinicId, sesion.clinicId));

    const vivos = filas.filter((g) => !g.revokedAt);
    return { permisos: vivos, total: vivos.length };
  });

  /** Caducar peticiones vencidas. Lo llama un cron; idempotente. */
  app.post("/grants/v1/sweep", async (_req, reply) => {
    const r = await db
      .update(grantRequests)
      .set({ state: "expired" })
      .where(
        and(
          eq(grantRequests.state, "pending"),
          lt(grantRequests.expiresAt, new Date()),
        ),
      )
      .returning({ id: grantRequests.id });
    return reply.send({ caducadas: r.length });
  });
}
