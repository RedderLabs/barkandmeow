import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { clinics, owners, petProfiles, pets, reclamaciones } from "@barkandmeow/db";
import { resolverReclamacionBody } from "@barkandmeow/schema";
import { db, enviarCorreo, env } from "../core.js";
import { desestimarReclamacion, traspasarChip } from "./mascotas.js";

/* Panel del operador del servicio (decidido 2026-09-30): revisión manual de
   las reclamaciones de chip que el barrido automático no resuelve, las
   impugnadas y las vencidas contra titulares sin cuenta. Sustituye al script
   `reclamaciones`, que se queda para la terminal.

   Una sola credencial, OPS_TOKEN, que vive en el servidor del panel
   (apps/ops) y nunca en un navegador. Sin OPS_TOKEN estas rutas no existen:
   responden 404, como cualquier ruta desconocida. El panel no se publica en
   el Caddy: se entra por la red interna. */

const TOKEN_RE = /^Bearer (\S{32,200})$/;
const RECIENTES_DIAS = 30;

function autorizado(req: FastifyRequest): boolean {
  const esperado = process.env.OPS_TOKEN ?? "";
  if (esperado.length < 32) return false;
  const m = TOKEN_RE.exec(req.headers.authorization ?? "");
  if (!m) return false;
  // Se comparan los hashes: misma longitud siempre, sin filtrar la del token.
  const a = createHash("sha256").update(m[1]).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

function exigir(req: FastifyRequest, reply: FastifyReply): boolean {
  if (autorizado(req)) return true;
  reply.code(404).send({ error: "no encontrado" });
  return false;
}

const titularPet = alias(pets, "titular_pet");
const reclamantePet = alias(pets, "reclamante_pet");
const titularOwner = alias(owners, "titular_owner");
const reclamanteOwner = alias(owners, "reclamante_owner");
const titularPerfil = alias(petProfiles, "titular_perfil");
const reclamantePerfil = alias(petProfiles, "reclamante_perfil");
const clinicaActivadora = alias(clinics, "clinica_activadora");

function consulta() {
  return db
    .select({
      id: reclamaciones.id,
      petId: reclamaciones.petId,
      reclamantePetId: reclamaciones.reclamantePetId,
      clinicId: reclamaciones.clinicId,
      estado: reclamaciones.estado,
      plazo: reclamaciones.plazo,
      creada: reclamaciones.createdAt,
      resuelta: reclamaciones.resueltaAt,
      nota: reclamaciones.notaOperador,
      clinica: {
        nombre: clinics.name,
        pais: clinics.country,
        direccion: clinics.address,
        registroSanitario: clinics.healthRegistry,
        dominio: clinics.domain,
        verificada: clinics.domainVerifiedAt,
      },
      titular: {
        estado: titularPet.estado,
        chipPista: titularPet.chipPista,
        activada: titularPet.activatedAt,
        activadaPor: clinicaActivadora.name,
        registrada: titularPet.createdAt,
        nombre: titularPerfil.nombre,
        correo: titularOwner.email,
        correoVerificado: titularOwner.emailVerifiedAt,
      },
      reclamante: {
        registrada: reclamantePet.createdAt,
        nombre: reclamantePerfil.nombre,
        correo: reclamanteOwner.email,
        correoVerificado: reclamanteOwner.emailVerifiedAt,
      },
    })
    .from(reclamaciones)
    .innerJoin(clinics, eq(clinics.id, reclamaciones.clinicId))
    .innerJoin(titularPet, eq(titularPet.id, reclamaciones.petId))
    .innerJoin(reclamantePet, eq(reclamantePet.id, reclamaciones.reclamantePetId))
    .leftJoin(titularOwner, eq(titularOwner.id, titularPet.ownerId))
    .leftJoin(reclamanteOwner, eq(reclamanteOwner.id, reclamantePet.ownerId))
    .leftJoin(titularPerfil, eq(titularPerfil.petId, titularPet.id))
    .leftJoin(reclamantePerfil, eq(reclamantePerfil.petId, reclamantePet.id))
    .leftJoin(clinicaActivadora, eq(clinicaActivadora.id, titularPet.activatedByClinicId));
}

type Fila = Awaited<ReturnType<typeof consulta>>[number];

/** Por qué está en la cola: lo que el operador tiene que decidir. */
function motivo(r: Fila): "impugnada" | "vencida-sin-cuenta" | "en-plazo" | "resuelta" {
  if (r.estado === "impugnada") return "impugnada";
  if (r.estado !== "abierta") return "resuelta";
  return r.plazo < new Date() && !r.titular.correo ? "vencida-sin-cuenta" : "en-plazo";
}

const fecha = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

/** Avisa a las dos partes del resultado, a quien tenga cuenta. Nunca lanza. */
async function avisarResolucion(r: Fila, aFavor: "reclamante" | "titular", log: FastifyRequest["log"]) {
  const chip = `el chip terminado en ${r.titular.chipPista ?? "····"}`;
  const cartas = [
    r.titular.correo && {
      para: r.titular.correo,
      asunto: aFavor === "titular" ? "La reclamación sobre tu chip no ha prosperado" : "La reclamación sobre tu chip se ha resuelto",
      texto:
        aFavor === "titular"
          ? `Hemos revisado la reclamación sobre ${chip} y sigue a tu nombre. Tu perfil público vuelve a mostrarse.\n\n    ${env.portalWebUrl}`
          : `Hemos revisado la reclamación sobre ${chip} y el chip pasa a la otra persona. Si crees que es un error, responde a este correo con la documentación del animal (pasaporte, factura de la implantación o cartilla).`,
    },
    r.reclamante.correo && {
      para: r.reclamante.correo,
      asunto: aFavor === "reclamante" ? "Tu reclamación de chip ha prosperado" : "Tu reclamación de chip no ha prosperado",
      texto:
        aFavor === "reclamante"
          ? `Hemos revisado tu reclamación sobre ${chip}: el chip ya está a tu nombre y su registro, activo.\n\n    ${env.portalWebUrl}`
          : `Hemos revisado tu reclamación sobre ${chip} y el chip sigue a nombre de su titular. Si tienes documentación que no hayamos visto, responde a este correo.`,
    },
  ].filter((c): c is { para: string; asunto: string; texto: string } => !!c);
  for (const c of cartas)
    await enviarCorreo(c).catch((e) => log.warn({ err: (e as Error).message }, "no se pudo avisar de la resolución"));
}

export default async function rutasOperador(app: FastifyInstance) {
  /**
   * La cola: lo que espera revisión (impugnadas y vencidas sin cuenta), lo
   * abierto en plazo, para ver venir, y lo resuelto en los últimos 30 días.
   */
  app.get("/ops/v1/claims", async (req, reply) => {
    if (!exigir(req, reply)) return;
    const desde = new Date(Date.now() - RECIENTES_DIAS * 864e5);
    const filas = await consulta()
      .where(
        or(
          inArray(reclamaciones.estado, ["abierta", "impugnada"]),
          gt(reclamaciones.resueltaAt, desde),
        ),
      )
      .orderBy(desc(reclamaciones.createdAt));
    reply.header("cache-control", "no-store");
    return { reclamaciones: filas.map((r) => ({ ...r, motivo: motivo(r) })) };
  });

  /** Resolver a mano, con una nota que queda guardada y avisa a las dos partes. */
  app.post("/ops/v1/claims/:id/resolve", async (req, reply) => {
    if (!exigir(req, reply)) return;
    const { id } = req.params as { id: string };
    if (!/^[0-9a-f-]{36}$/.test(id)) return reply.code(404).send({ error: "no encontrada" });
    const cuerpo = resolverReclamacionBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const [r] = await consulta()
      .where(and(eq(reclamaciones.id, id), inArray(reclamaciones.estado, ["abierta", "impugnada"])))
      .limit(1);
    if (!r) return reply.code(404).send({ error: "no existe o ya está resuelta" });
    // Una abierta en plazo con titular avisado no se adelanta: tiene derecho a impugnar.
    if (motivo(r) === "en-plazo")
      return reply.code(409).send({ error: "sigue en plazo: el titular aún puede impugnar", motivo: "en-plazo" });

    const hecho = cuerpo.data.aFavor === "reclamante" ? await traspasarChip(r) : await desestimarReclamacion(r);
    if (!hecho) return reply.code(409).send({ error: "otra resolución se adelantó", motivo: "resuelta" });
    await db.update(reclamaciones).set({ notaOperador: cuerpo.data.nota }).where(eq(reclamaciones.id, r.id));
    req.log.info({ reclamacion: r.id, aFavor: cuerpo.data.aFavor }, "reclamación resuelta a mano");
    await avisarResolucion(r, cuerpo.data.aFavor, req.log);
    return { ok: true, estado: cuerpo.data.aFavor === "reclamante" ? "a-favor-reclamante" : "a-favor-titular" };
  });
}

