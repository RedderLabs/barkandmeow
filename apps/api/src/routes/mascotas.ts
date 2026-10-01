import type { FastifyInstance, FastifyReply } from "fastify";
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { blobs, clinics, grants, petIdentifiers, pets, reclamaciones } from "@barkandmeow/db";
import { activacionBody, normalizarChip, petRegisterBody } from "@barkandmeow/schema";
import {
  db,
  hashCodigoCorreo,
  indexar,
  mismoHash,
  normalizarCodigoCorreo,
  nuevoCodigoCorreo,
} from "../core.js";
import { sesionDe } from "./clinics.js";
import { avisarReclamacion } from "./duenos.js";
import { limpiarEtiquetas } from "./pacientes.js";

/* Registro de mascotas sin robo de chips (decidido 2026-09-27).

   El número de chip no es secreto: lo lee cualquier lector y sale en
   pasaportes y facturas. Por eso registrarlo no da nada por sí solo:

   1. El dueño registra el chip desde su app: el registro nace «pendiente», con
      un código de activación que solo ve él. Un pendiente no responde a
      ninguna búsqueda ni reserva el chip; puede haber varios del mismo chip.
   2. Una clínica verificada lee el chip con el animal delante y teclea el
      código del dueño: el registro pasa a «activo» y el chip queda suyo.
   3. Si el chip ya estaba activo a nombre de otro, la clínica abre una
      reclamación con los mismos datos. El registro actual queda congelado y,
      si su titular no la impugna en 14 días, el chip pasa al reclamante.

   El código de activación usa el mismo alfabeto que el del correo. */

const ACTIVACION_VIGENCIA_MS = 30 * 864e5;
const ACTIVACION_INTENTOS = 10;
export const PLAZO_RECLAMACION_MS = 14 * 864e5;

async function indiceDe(identificador: { tipo: string; valor: string }) {
  const [idx] = await indexar([normalizarChip(identificador.valor)]);
  return idx;
}

/** El registro activo (o congelado) de un chip, si lo hay. */
async function titularDe(idx: Buffer) {
  const [t] = await db
    .select({ petId: pets.id, estado: pets.estado })
    .from(petIdentifiers)
    .innerJoin(pets, eq(pets.id, petIdentifiers.petId))
    .where(and(eq(petIdentifiers.idIndex, idx), eq(petIdentifiers.activo, true)))
    .limit(1);
  return t ?? null;
}

/**
 * El registro pendiente de ese chip cuyo código de activación coincide.
 * Un código equivocado suma un intento a todos los pendientes del chip: así
 * nadie prueba códigos a ciegas, y el dueño puede pedir uno nuevo en su app.
 */
async function pendienteConCodigo(idx: Buffer, codigo: string, reply: FastifyReply) {
  const candidatos = await db
    .select({
      petId: pets.id,
      hash: pets.activationCodeHash,
      caduca: pets.activationExpiresAt,
      intentos: pets.activationAttempts,
    })
    .from(petIdentifiers)
    .innerJoin(pets, eq(pets.id, petIdentifiers.petId))
    .where(and(eq(petIdentifiers.idIndex, idx), eq(pets.estado, "pendiente")));

  if (!candidatos.length) {
    reply.code(404).send({ error: "no hay registro pendiente", motivo: "sin-registro" });
    return null;
  }
  /* Cada candidato reserva su intento antes de comparar, en una sola
     sentencia: con peticiones en paralelo nadie pasa del tope. Si el código
     acierta, el intento se devuelve. */
  const reservados = await db
    .update(pets)
    .set({ activationAttempts: sql`${pets.activationAttempts} + 1` })
    .where(
      and(
        inArray(
          pets.id,
          candidatos.map((c) => c.petId),
        ),
        lt(pets.activationAttempts, ACTIVACION_INTENTOS),
      ),
    )
    .returning({ petId: pets.id });
  const conIntento = new Set(reservados.map((r) => r.petId));

  const limpio = normalizarCodigoCorreo(codigo);
  const ahora = new Date();
  const bueno = candidatos.find(
    (c) =>
      conIntento.has(c.petId) &&
      c.hash &&
      c.caduca &&
      c.caduca > ahora &&
      mismoHash(hashCodigoCorreo(c.petId, limpio), c.hash),
  );
  if (!bueno) {
    reply.code(400).send({ error: "código de activación incorrecto", motivo: "codigo-incorrecto" });
    return null;
  }
  await db
    .update(pets)
    .set({ activationAttempts: sql`${pets.activationAttempts} - 1` })
    .where(inArray(pets.id, [...conIntento]));
  return bueno;
}

/** Solo una clínica con sesión y el correo verificado activa o reclama. */
async function clinicaActiva(req: Parameters<typeof sesionDe>[0], reply: FastifyReply) {
  const s = await sesionDe(req);
  if (!s) {
    reply.code(401).send({ error: "sin sesión" });
    return null;
  }
  if (!s.clinicaActiva) {
    reply.code(403).send({ error: "verifica el correo de la clínica primero", motivo: "correo-sin-verificar" });
    return null;
  }
  return s;
}

/** Da un código de activación nuevo a un registro pendiente; el anterior deja de valer. */
export async function nuevoCodigoActivacion(petId: string) {
  const codigo = nuevoCodigoCorreo();
  const caduca = new Date(Date.now() + ACTIVACION_VIGENCIA_MS);
  await db
    .update(pets)
    .set({ activationCodeHash: hashCodigoCorreo(petId, codigo), activationExpiresAt: caduca, activationAttempts: 0 })
    .where(eq(pets.id, petId));
  /* Solo lo ve el dueño: se lo enseña a la clínica con el animal delante. El
     servidor guarda su hash, así que no se puede volver a mostrar. */
  return { codigoActivacion: `${codigo.slice(0, 4)}-${codigo.slice(4)}`, caduca };
}

/** Alta pendiente de un chip: no responde a nada hasta que una clínica la active. */
export async function registrarPendiente(opciones: {
  identificador: { tipo: "iso" | "nonISO" | "ring" | "tattoo"; valor: string };
  ownerPubKey: Buffer;
  ownerId?: string;
}) {
  const valor = normalizarChip(opciones.identificador.valor);
  const [idx] = await indexar([valor]);
  const [pet] = await db
    .insert(pets)
    .values({
      ownerPubKey: opciones.ownerPubKey,
      estado: "pendiente",
      ownerId: opciones.ownerId ?? null,
      chipPista: valor.replace(/\D/g, "").slice(-4) || null,
    })
    .returning({ id: pets.id });
  await db.insert(petIdentifiers).values({
    petId: pet.id,
    kind: opciones.identificador.tipo,
    idIndex: idx,
    activo: false,
  });
  return { petId: pet.id, ...(await nuevoCodigoActivacion(pet.id)) };
}

export default async function rutasMascotas(app: FastifyInstance) {
  /* Sin sesión y sin coste para quien llama: límite propio por IP, más corto
     que el del grupo, para que nadie llene la base de registros pendientes. */
  const registros = { max: Number(process.env.LIMITE_REGISTRO_MASCOTA ?? 5), timeWindow: "1 minute" };

  /** El dueño registra el chip desde la app. Queda pendiente hasta que lo active una clínica. */
  app.post("/pets/v1/register", { config: { rateLimit: registros } }, async (req, reply) => {
    const cuerpo = petRegisterBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const r = await registrarPendiente({
      identificador: cuerpo.data.identificador,
      ownerPubKey: Buffer.from(cuerpo.data.ownerPubKey, "base64"),
    });
    return reply.code(201).send({ ...r, estado: "pendiente" });
  });

  /** La clínica activa el registro: chip leído con su lector y código del dueño. */
  app.post("/pets/v1/activate", async (req, reply) => {
    const s = await clinicaActiva(req, reply);
    if (!s) return;
    const cuerpo = activacionBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const idx = await indiceDe(cuerpo.data.identificador);

    const pendiente = await pendienteConCodigo(idx, cuerpo.data.codigo, reply);
    if (!pendiente) return;

    const titular = await titularDe(idx);
    if (titular) {
      return reply.code(409).send({
        error: "el chip ya está activo a nombre de otra persona",
        motivo: titular.estado === "congelada" ? "ya-reclamado" : "ya-activo",
      });
    }

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(petIdentifiers)
          .set({ activo: true })
          .where(and(eq(petIdentifiers.petId, pendiente.petId), eq(petIdentifiers.idIndex, idx)));
        await tx
          .update(pets)
          .set({
            estado: "activa",
            activatedAt: new Date(),
            activatedByClinicId: s.clinicId,
            activationCodeHash: null,
            activationExpiresAt: null,
            activationAttempts: 0,
          })
          .where(eq(pets.id, pendiente.petId));
      });
    } catch {
      // Dos clínicas a la vez con el mismo chip: el índice único decide.
      return reply.code(409).send({ error: "el chip acaba de activarse", motivo: "ya-activo" });
    }
    return { petId: pendiente.petId, estado: "activa" };
  });

  /** Reclamación: el chip está activo a nombre de otro y el animal está aquí. */
  app.post("/pets/v1/claims", async (req, reply) => {
    const s = await clinicaActiva(req, reply);
    if (!s) return;
    /* Reclamar congela la ficha de otra persona: no basta con un correo
       gratuito verificado, hace falta el dominio propio de la clínica. */
    const [c] = await db
      .select({ domainVerifiedAt: clinics.domainVerifiedAt })
      .from(clinics)
      .where(eq(clinics.id, s.clinicId))
      .limit(1);
    if (!c?.domainVerifiedAt)
      return reply
        .code(403)
        .send({ error: "solo una clínica con el dominio verificado abre reclamaciones", motivo: "dominio-sin-verificar" });
    const cuerpo = activacionBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const idx = await indiceDe(cuerpo.data.identificador);

    const pendiente = await pendienteConCodigo(idx, cuerpo.data.codigo, reply);
    if (!pendiente) return;
    const titular = await titularDe(idx);
    if (!titular)
      return reply.code(409).send({ error: "el chip no está activo: actívalo sin más", motivo: "libre" });
    if (titular.estado === "congelada")
      return reply.code(409).send({ error: "ya hay una reclamación abierta", motivo: "ya-reclamado" });

    const plazo = new Date(Date.now() + PLAZO_RECLAMACION_MS);
    const [r] = await db.transaction(async (tx) => {
      await tx.update(pets).set({ estado: "congelada" }).where(eq(pets.id, titular.petId));
      return tx
        .insert(reclamaciones)
        .values({ petId: titular.petId, reclamantePetId: pendiente.petId, clinicId: s.clinicId, plazo })
        .returning({ id: reclamaciones.id });
    });
    // El titular se entera por correo si tiene cuenta en el portal, y puede
    // impugnarla desde ahí. PENDIENTE: el aviso push en la app.
    try {
      await avisarReclamacion(titular.petId, plazo);
    } catch (e) {
      req.log.warn({ err: (e as Error).message }, "no se pudo avisar al titular de la reclamación");
    }
    return reply.code(201).send({ reclamacionId: r.id, plazo });
  });

  /* Sin ruta de barrido: lo hace el cron interno, y lo que el cron no resuelve,
     el operador con scripts/reclamaciones.ts. */
}

/**
 * Resuelve las reclamaciones vencidas sin impugnar: el chip pasa al
 * reclamante. Idempotente: la llama el cron interno de la API.
 *
 * Solo si el titular tiene cuenta en el portal: es la única vía por la que se
 * entera y puede impugnar. Sin cuenta, callar no es consentir; la reclamación
 * sigue abierta tras el plazo y espera revisión manual.
 */
export async function resolverReclamaciones(): Promise<number> {
  const vencidas = await db
    .select({
      id: reclamaciones.id,
      petId: reclamaciones.petId,
      reclamantePetId: reclamaciones.reclamantePetId,
      clinicId: reclamaciones.clinicId,
    })
    .from(reclamaciones)
    .innerJoin(pets, eq(pets.id, reclamaciones.petId))
    .where(
      and(
        eq(reclamaciones.estado, "abierta"),
        lt(reclamaciones.plazo, new Date()),
        isNotNull(pets.ownerId),
      ),
    );

  let resueltas = 0;
  for (const r of vencidas) if (await traspasarChip(r)) resueltas++;
  return resueltas;
}

type Reclamacion = { id: string; petId: string; reclamantePetId: string; clinicId: string };

/** Solo se resuelve lo que sigue abierto o impugnado: dos resoluciones a la vez no se pisan. */
async function cerrarReclamacion(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  id: string,
  estado: "a-favor-reclamante" | "a-favor-titular",
) {
  const r = await tx
    .update(reclamaciones)
    .set({ estado, resueltaAt: new Date() })
    .where(and(eq(reclamaciones.id, id), inArray(reclamaciones.estado, ["abierta", "impugnada"])))
    .returning({ id: reclamaciones.id });
  return r.length > 0;
}

/** El chip pasa al reclamante y el registro del titular se retira. */
export async function traspasarChip(r: Reclamacion): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (!(await cerrarReclamacion(tx, r.id, "a-favor-reclamante"))) return false;
    const idsTitular = await tx
      .select({ idIndex: petIdentifiers.idIndex })
      .from(petIdentifiers)
      .where(and(eq(petIdentifiers.petId, r.petId), eq(petIdentifiers.activo, true)));
    await tx
      .update(petIdentifiers)
      .set({ activo: false })
      .where(eq(petIdentifiers.petId, r.petId));
    await tx.update(pets).set({ estado: "retirada" }).where(eq(pets.id, r.petId));
    // Lo que el titular compartió deja de servirse: el chip ya no es suyo.
    const ahora = new Date();
    await tx
      .update(grants)
      .set({ revokedAt: ahora })
      .where(and(eq(grants.petId, r.petId), isNull(grants.revokedAt)));
    await limpiarEtiquetas(r.petId, tx);
    await tx
      .update(blobs)
      .set({ expiresAt: ahora })
      .where(and(eq(blobs.petId, r.petId), eq(blobs.kind, "share")));
    if (idsTitular.length)
      await tx
        .update(petIdentifiers)
        .set({ activo: true })
        .where(
          and(
            eq(petIdentifiers.petId, r.reclamantePetId),
            inArray(
              petIdentifiers.idIndex,
              idsTitular.map((i) => i.idIndex),
            ),
          ),
        );
    await tx
      .update(pets)
      .set({
        estado: "activa",
        activatedAt: new Date(),
        activatedByClinicId: r.clinicId,
        activationCodeHash: null,
        activationExpiresAt: null,
      })
      .where(eq(pets.id, r.reclamantePetId));
    return true;
  });
}

/** La reclamación no prospera: el titular recupera su ficha y el reclamante sigue pendiente. */
export async function desestimarReclamacion(r: Reclamacion): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (!(await cerrarReclamacion(tx, r.id, "a-favor-titular"))) return false;
    await tx
      .update(pets)
      .set({ estado: "activa" })
      .where(and(eq(pets.id, r.petId), eq(pets.estado, "congelada")));
    return true;
  });
}

