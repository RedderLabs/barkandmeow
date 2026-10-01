import type { FastifyInstance } from "fastify";
import { and, asc, eq, gt, inArray, isNotNull, isNull, max, notExists, or, sql } from "drizzle-orm";
import {
  accessLog,
  clinicMembers,
  dispositivosMiembro,
  envios,
  etiquetasPaciente,
  grants,
  petIdentifiers,
  pets,
} from "@barkandmeow/db";
import { chipClinicaBody, dispositivoClinicaBody, entregaEtiquetasBody, etiquetaBody, normalizarChip } from "@barkandmeow/schema";
import { db, indexar } from "../core.js";
import { sesionDe } from "./clinics.js";

/* La portada de la consola (decidido 2026-10-01): un campo de chip que dice
   qué toca, y debajo los pacientes.

   La clínica reconoce a un paciente por el final del chip, la fecha del alta
   y una etiqueta que escribe ella («Kira, de Ana»). La etiqueta va cifrada en
   su navegador con una clave que sale de la clave de la clínica: aquí llegan
   y salen bytes opacos, y este archivo no sabe qué dicen. */

/** Navegadores por miembro: el de casa, el del mostrador y alguno más. */
const DISPOSITIVOS_POR_MIEMBRO = 5;

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

  /* ── Los nombres, para todo el equipo ──────────────────────
     La clave de las etiquetas sale de la clave de la clínica, que solo tienen
     los administradores. Para que el resto del equipo lea los nombres, cada
     navegador se presenta con su clave pública y un administrador le deja la
     clave de las etiquetas cifrada de clínica a dispositivo. Aquí solo se
     guardan y se reparten esos bytes.

     Lo que esto no cubre: el administrador cifra para las claves públicas que
     esta API le lista. Protege los nombres de una fuga de la base, no de un
     servidor que mintiera sobre los dispositivos del equipo; es la misma
     confianza que ya pide entregar la clave de la clínica a otro administrador. */

  /** El navegador se presenta. Si ya le dejaron la clave de las etiquetas, se la lleva. */
  app.post("/clinics/v1/me/devices", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    const cuerpo = dispositivoClinicaBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });
    const pubKey = Buffer.from(cuerpo.data.devicePubKey, "base64");

    await db.insert(dispositivosMiembro).values({ memberId: s.memberId, pubKey }).onConflictDoNothing();
    const mios = await db
      .select({ id: dispositivosMiembro.id, pubKey: dispositivosMiembro.pubKey, clave: dispositivosMiembro.claveEtiquetas })
      .from(dispositivosMiembro)
      .where(eq(dispositivosMiembro.memberId, s.memberId))
      .orderBy(asc(dispositivosMiembro.createdAt));
    const este = mios.find((d) => d.pubKey.equals(pubKey));

    // Los navegadores más antiguos ceden el sitio; el que se presenta ahora, nunca.
    const sobran = mios
      .filter((d) => d.id !== este?.id)
      .slice(0, Math.max(0, mios.length - DISPOSITIVOS_POR_MIEMBRO));
    if (sobran.length)
      await db.delete(dispositivosMiembro).where(
        inArray(
          dispositivosMiembro.id,
          sobran.map((d) => d.id),
        ),
      );
    return { claveEtiquetas: este?.clave ? este.clave.toString("base64") : null };
  });

  /** Los navegadores del equipo que todavía no pueden leer los nombres. */
  app.get("/clinics/v1/label-keys/pending", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    if (s.role !== "admin") return reply.code(403).send({ error: "solo un administrador reparte la clave" });
    const filas = await db
      .select({ id: dispositivosMiembro.id, pubKey: dispositivosMiembro.pubKey })
      .from(dispositivosMiembro)
      .innerJoin(clinicMembers, eq(clinicMembers.id, dispositivosMiembro.memberId))
      .where(
        and(
          eq(clinicMembers.clinicId, s.clinicId),
          isNull(clinicMembers.revokedAt),
          isNotNull(clinicMembers.acceptedAt),
          isNull(dispositivosMiembro.claveEtiquetas),
        ),
      )
      .limit(50);
    return { dispositivos: filas.map((f) => ({ id: f.id, devicePubKey: f.pubKey.toString("base64") })) };
  });

  /** Un administrador deja la clave cifrada para cada navegador. Solo a los de su clínica. */
  app.post("/clinics/v1/label-keys", async (req, reply) => {
    const s = await sesionDe(req);
    if (!s) return reply.code(401).send({ error: "sin sesión" });
    if (s.role !== "admin") return reply.code(403).send({ error: "solo un administrador reparte la clave" });
    const cuerpo = entregaEtiquetasBody.safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "cuerpo inválido" });

    const delEquipo = db
      .select({ id: clinicMembers.id })
      .from(clinicMembers)
      .where(and(eq(clinicMembers.clinicId, s.clinicId), isNull(clinicMembers.revokedAt)));
    let entregadas = 0;
    for (const e of cuerpo.data.entregas) {
      const r = await db
        .update(dispositivosMiembro)
        .set({ claveEtiquetas: Buffer.from(e.sellada, "base64") })
        .where(
          and(
            eq(dispositivosMiembro.id, e.dispositivoId),
            // Lo ya entregado no se pisa: nadie cambia la clave de otro navegador.
            isNull(dispositivosMiembro.claveEtiquetas),
            inArray(dispositivosMiembro.memberId, delEquipo),
          ),
        )
        .returning({ id: dispositivosMiembro.id });
      entregadas += r.length;
    }
    return { entregadas };
  });
}
