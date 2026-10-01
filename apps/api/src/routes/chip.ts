import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { accessLog, clinics, grantRequests, grants, petIdentifiers, pets } from "@barkandmeow/db";
import {
  chipLookupBody,
  grantApproveBody,
  grantRejectBody,
  grantRequestBody,
  grantRevokeBody,
  normalizarChip,
  origenChip,
} from "@barkandmeow/schema";
import {
  db,
  env,
  firmarAviso,
  gastarPresupuesto,
  indexar,
  numeroComparacion,
  senueloAviso,
} from "../core.js";
import { avisarPush } from "../push.js";
import { sesionDe } from "./clinics.js";
import { duenoDe } from "./duenos.js";
import { perfilPublico } from "./ficha.js";

/** La petición de alta caduca pronto: el número está en pantalla mientras tanto. */
const VENTANA_MS = 10 * 60 * 1000;

/* TLS oculta el contenido pero no el tamaño del paquete. Si la respuesta del
   nivel 0 fuese más larga cuando hay ficha, un observador de red sabría qué
   chips existen sin descifrar nada. Todas las respuestas se rellenan al mismo
   tamaño, y cuando no hay ficha van señuelos con la forma correcta. */
const RESPUESTA_BYTES = 4096;

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
      // Solo registros activados en clínica: un pendiente no existe para nadie.
      .where(and(eq(petIdentifiers.idIndex, idx), eq(petIdentifiers.activo, true)))
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
    /* Para avisar al dueño desde la web sin sesión: token y clave pública con
       la que sellar el aviso. Con señuelos si no hay ficha. */
    let aviso = senueloAviso();
    let ownerPubKey = randomBytes(32).toString("base64");
    let perfil = null as Awaited<ReturnType<typeof perfilPublico>>;
    if (encontrado) {
      aviso = firmarAviso(encontrado.petId);
      ownerPubKey = encontrado.ownerPubKey.toString("base64");
      perfil = await perfilPublico(encontrado.petId);
    }

    // Una clínica sin correo verificado no abre peticiones de alta.
    if (encontrado && sesion?.clinicaActiva && parsed.data.vetPubKey) {
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
      // Sin esperar: el aviso no puede alargar una respuesta de tiempo fijo.
      void avisarPush({ tipo: "permiso", petId: encontrado.petId }, req.log);
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
      padear({ existe: !!encontrado, origen, requestId, sas, aviso, ownerPubKey, perfil }),
    );
  });

  /** Alta de nivel 3 pedida explícitamente, sin pasar por el lookup. */
  app.post("/grants/v1/request", async (req, reply) => {
    const sesion = await sesionDe(req);
    if (!sesion) return reply.code(401).send({ error: "sin sesión" });
    if (!sesion.clinicaActiva)
      return reply.code(403).send({ error: "verifica el correo de la clínica primero", motivo: "correo-sin-verificar" });

    const parsed = grantRequestBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const t0 = Date.now();
    const valor = normalizarChip(parsed.data.identificador.valor);
    const [idx] = await indexar([valor]);

    const filas = await db
      .select({ petId: pets.id, ownerPubKey: pets.ownerPubKey })
      .from(petIdentifiers)
      .innerJoin(pets, eq(pets.id, petIdentifiers.petId))
      // Solo registros activados en clínica: un pendiente no existe para nadie.
      .where(and(eq(petIdentifiers.idIndex, idx), eq(petIdentifiers.activo, true)))
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

    // El dueño tiene diez minutos: se le avisa al móvil, sin contenido.
    await avisarPush({ tipo: "permiso", petId: filas[0].petId }, req.log);
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
   * El servidor guarda bytes que no puede abrir. Solo el dueño de la mascota,
   * con su sesión abierta: la clínica que pidió el acceso conoce el requestId
   * y no puede aprobárselo a sí misma.
   */
  app.post("/grants/v1/approve", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const parsed = grantApproveBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const filas = await db
      .select({ id: grantRequests.id, petId: grantRequests.petId, clinicId: grantRequests.clinicId })
      .from(grantRequests)
      .innerJoin(pets, eq(pets.id, grantRequests.petId))
      .where(
        and(
          eq(grantRequests.id, parsed.data.requestId),
          eq(pets.ownerId, d.ownerId),
          // Con una reclamación abierta el titular puede no ser el dueño real.
          eq(pets.estado, "activa"),
          eq(grantRequests.state, "pending"),
          gt(grantRequests.expiresAt, new Date()),
        ),
      )
      .limit(1);
    // Misma respuesta si la petición es de otra mascota: no se confirma que exista.
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

  /** Solo el dueño de la mascota retira el nivel 3. */
  app.post("/grants/v1/revoke", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const parsed = grantRevokeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const r = await db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(grants.id, parsed.data.grantId),
          isNull(grants.revokedAt),
          inArray(
            grants.petId,
            db.select({ id: pets.id }).from(pets).where(eq(pets.ownerId, d.ownerId)),
          ),
        ),
      )
      .returning({ id: grants.id });
    if (!r.length) return reply.code(404).send({ error: "no encontrado" });

    /* Honesto: borra la copia del servidor, no lo que ya se descargó. */
    return { ok: true, descargadoNoVuelve: true };
  });

  /** El dueño dice que no: el número no coincide o no conoce a la clínica. */
  app.post("/grants/v1/reject", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;
    const parsed = grantRejectBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const r = await db
      .update(grantRequests)
      .set({ state: "rejected" })
      .where(
        and(
          eq(grantRequests.id, parsed.data.requestId),
          eq(grantRequests.state, "pending"),
          gt(grantRequests.expiresAt, new Date()),
          inArray(
            grantRequests.petId,
            db.select({ id: pets.id }).from(pets).where(eq(pets.ownerId, d.ownerId)),
          ),
        ),
      )
      .returning({ id: grantRequests.id });
    // Misma respuesta si la petición es de otra mascota: no se confirma que exista.
    if (!r.length) return reply.code(410).send({ error: "petición caducada o ya resuelta" });
    return { ok: true };
  });

  /**
   * Lo que el dueño necesita para decidir: las peticiones que esperan, con el
   * número de comparación y la clave para la que envolver K, y los permisos
   * que tiene dados. El número se deriva aquí igual que al pedir el alta.
   */
  app.get("/grants/v1/owner", async (req, reply) => {
    const d = await duenoDe(req, reply);
    if (!d) return;

    const clinica = {
      nombre: clinics.name,
      pais: clinics.country,
      dominio: clinics.domain,
      verificada: clinics.domainVerifiedAt,
    };
    const verClinica = (c: { nombre: string; pais: string; dominio: string | null; verificada: Date | null }) => ({
      nombre: c.nombre,
      pais: c.pais,
      dominio: c.verificada ? c.dominio : null,
    });

    const pendientes = await db
      .select({
        requestId: grantRequests.id,
        petId: grantRequests.petId,
        vetPubKey: grantRequests.vetPubKey,
        ownerPubKey: pets.ownerPubKey,
        caduca: grantRequests.expiresAt,
        ...clinica,
      })
      .from(grantRequests)
      .innerJoin(pets, eq(pets.id, grantRequests.petId))
      .innerJoin(clinics, eq(clinics.id, grantRequests.clinicId))
      .where(
        and(
          eq(pets.ownerId, d.ownerId),
          eq(pets.estado, "activa"),
          eq(grantRequests.state, "pending"),
          gt(grantRequests.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(grantRequests.createdAt));

    const dados = await db
      .select({ grantId: grants.id, petId: grants.petId, desde: grants.createdAt, ...clinica })
      .from(grants)
      .innerJoin(pets, eq(pets.id, grants.petId))
      .innerJoin(clinics, eq(clinics.id, grants.clinicId))
      .where(
        and(
          eq(pets.ownerId, d.ownerId),
          eq(grants.level, 3),
          isNull(grants.revokedAt),
          or(isNull(grants.expiresAt), gt(grants.expiresAt, new Date())),
        ),
      )
      .orderBy(desc(grants.createdAt));

    return {
      peticiones: pendientes.map((p) => ({
        requestId: p.requestId,
        petId: p.petId,
        clinica: verClinica(p),
        vetPubKey: p.vetPubKey.toString("base64"),
        sas: numeroComparacion(p.vetPubKey, p.ownerPubKey, p.requestId),
        caduca: p.caduca,
      })),
      permisos: dados.map((g) => ({
        grantId: g.grantId,
        petId: g.petId,
        clinica: verClinica(g),
        desde: g.desde,
      })),
    };
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

  /* Sin ruta de barrido: lo hace el cron interno (iniciarCron en index.ts). */
}

/** Caduca las peticiones de alta vencidas. La llama el cron interno. */
export async function caducarPeticiones(): Promise<number> {
  const r = await db
    .update(grantRequests)
    .set({ state: "expired" })
    .where(and(eq(grantRequests.state, "pending"), lt(grantRequests.expiresAt, new Date())))
    .returning({ id: grantRequests.id });
  return r.length;
}
