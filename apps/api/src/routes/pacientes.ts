import type { FastifyInstance } from "fastify";
import { and, eq, gt, inArray, isNull, max, notExists, or, sql } from "drizzle-orm";
import { accessLog, envios, etiquetasPaciente, grants, petIdentifiers, pets } from "@barkandmeow/db";
import { chipClinicaBody, etiquetaBody, normalizarChip } from "@barkandmeow/schema";
import { db, indexar } from "../core.js";
import { sesionDe } from "./clinics.js";

/* La portada de la consola (decidido 2026-10-01): un campo de chip que dice
   qué toca, y debajo los pacientes.

   La clínica reconoce a un paciente por el final del chip, la fecha del alta
   y una etiqueta que escribe ella («Kira, de Ana»). La etiqueta va cifrada en
   su navegador con una clave que sale de la clave de la clínica: aquí llegan
   y salen bytes opacos, y este archivo no sabe qué dicen. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Nivel 3 vivo de una clínica. */
const permisoVivo = (clinicId: string) =>
  and(
    eq(grants.clinicId, clinicId),
    eq(grants.level, 3),
    isNull(grants.revokedAt),
    or(isNull(grants.expiresAt), gt(grants.expiresAt, new Date())),
  );

type Ejecutor = Pick<typeof db, "delete">;

/**
 * Borra las etiquetas de una mascota que ya no tienen un nivel 3 vivo detrás.
 * La llaman las rutas que retiran permisos: la etiqueta es de la clínica, pero
 * nombra a un paciente que ha dejado de serlo.
 */
export async function limpiarEtiquetas(petId: string, ejecutor: Ejecutor = db) {
  await ejecutor.delete(etiquetasPaciente).where(
    and(
      eq(etiquetasPaciente.petId, petId),
      notExists(
        db
          .select({ uno: sql`1` })
          .from(grants)
          .where(
            and(
              eq(grants.petId, etiquetasPaciente.petId),
              eq(grants.clinicId, etiquetasPaciente.clinicId),
              eq(grants.level, 3),
              isNull(grants.revokedAt),
              or(isNull(grants.expiresAt), gt(grants.expiresAt, new Date())),
            ),
          ),
      ),
    ),
  );
}

export default async function rutasPacientes(app: FastifyInstance) {
  /**
   * Qué toca hacer con el chip que se acaba de leer. No devuelve nada de la
   * mascota ni de su dueño: solo el paso siguiente. Lo que revela ya lo
   * revelaban el nivel 0 (si está activo) y la activación (si hay un registro
   * pendiente); aquí va junto y con la clínica identificada.
   */
  app.post("/clinics/v1/chip", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    if (!s.clinicaActiva)
      return reply.code(403).send({ error: "verifica el correo de la clínica primero", motivo: "correo-sin-verificar" });
    const cuerpo = chipClinicaBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const [idx] = await indexar([normalizarChip(cuerpo.data.identificador.valor)]);
    const registros = await db
      .select({ petId: pets.id, estado: pets.estado, activo: petIdentifiers.activo })
      .from(petIdentifiers)
      .innerJoin(pets, eq(pets.id, petIdentifiers.petId))
      .where(eq(petIdentifiers.idIndex, idx));

    const titular = registros.find((r) => r.activo && (r.estado === "activa" || r.estado === "congelada"));
    const pendiente = registros.some((r) => r.estado === "pendiente");

    await db.insert(accessLog).values({
      clinicId: s.clinicId,
      action: "chip_consola",
      found: titular || pendiente ? "yes" : "no",
    });

    if (!titular) return { situacion: pendiente ? "pendiente" : "sin-registro", petId: null };
    if (titular.estado === "congelada") return { situacion: "reclamada", petId: null };

    const [permiso] = await db
      .select({ id: grants.id })
      .from(grants)
      .where(and(eq(grants.petId, titular.petId), permisoVivo(s.clinicId)))
      .limit(1);
    return permiso ? { situacion: "paciente", petId: titular.petId } : { situacion: "activa", petId: null };
  });

  /** Los pacientes de la clínica: lo justo para reconocerlos. Nunca contenido. */
  app.get("/clinics/v1/patients", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });

    // Un dueño puede haber aprobado dos veces: el paciente sale una, con su alta más antigua.
    const filas = await db
      .selectDistinctOn([pets.id], {
        petId: pets.id,
        chipPista: pets.chipPista,
        desde: grants.createdAt,
        caduca: grants.expiresAt,
        etiqueta: etiquetasPaciente.sealed,
      })
      .from(grants)
      .innerJoin(pets, eq(pets.id, grants.petId))
      .leftJoin(
        etiquetasPaciente,
        and(eq(etiquetasPaciente.petId, pets.id), eq(etiquetasPaciente.clinicId, s.clinicId)),
      )
      .where(and(permisoVivo(s.clinicId), eq(pets.estado, "activa")))
      .orderBy(pets.id, grants.createdAt);

    const ultimos = filas.length
      ? await db
          .select({ petId: envios.petId, fecha: max(envios.createdAt) })
          .from(envios)
          .where(
            and(
              eq(envios.clinicId, s.clinicId),
              inArray(
                envios.petId,
                filas.map((f) => f.petId),
              ),
            ),
          )
          .groupBy(envios.petId)
      : [];
    const ultimoDe = new Map(ultimos.map((u) => [u.petId, u.fecha]));

    return {
      pacientes: filas
        .map((f) => ({
          ...f,
          etiqueta: f.etiqueta ? f.etiqueta.toString("base64") : null,
          ultimoEnvio: ultimoDe.get(f.petId) ?? null,
        }))
        // Las altas más recientes, arriba: es a quien se acaba de atender.
        .sort((a, b) => b.desde.getTime() - a.desde.getTime()),
    };
  });

  /** ¿Tiene la clínica el nivel 3 de esta mascota? Si no, no hay nada que etiquetar. */
  const esPaciente = async (clinicId: string, petId: string) => {
    if (!UUID.test(petId)) return false;
    const [p] = await db
      .select({ id: grants.id })
      .from(grants)
      .innerJoin(pets, eq(pets.id, grants.petId))
      .where(and(eq(grants.petId, petId), permisoVivo(clinicId), eq(pets.estado, "activa")))
      .limit(1);
    return !!p;
  };

  /** Cualquier miembro etiqueta; solo abre la etiqueta quien tiene la clave. */
  app.put("/clinics/v1/patients/:petId/label", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    const { petId } = req.params as { petId: string };
    const cuerpo = etiquetaBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    // Misma respuesta si la mascota no existe o no es paciente de esta clínica.
    if (!(await esPaciente(s.clinicId, petId))) return reply.code(404).send({ error: "no es paciente de la clínica" });

    const sealed = Buffer.from(cuerpo.data.etiqueta, "base64");
    await db
      .insert(etiquetasPaciente)
      .values({ clinicId: s.clinicId, petId, sealed, escritaPor: s.memberId })
      .onConflictDoUpdate({
        target: [etiquetasPaciente.clinicId, etiquetasPaciente.petId],
        set: { sealed, escritaPor: s.memberId, actualizada: new Date() },
      });
    return { ok: true };
  });

  app.delete("/clinics/v1/patients/:petId/label", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    const { petId } = req.params as { petId: string };
    if (!UUID.test(petId)) return reply.code(404).send({ error: "sin etiqueta" });
    const r = await db
      .delete(etiquetasPaciente)
      .where(and(eq(etiquetasPaciente.clinicId, s.clinicId), eq(etiquetasPaciente.petId, petId)))
      .returning({ petId: etiquetasPaciente.petId });
    if (!r.length) return reply.code(404).send({ error: "sin etiqueta" });
    return { ok: true };
  });
}
