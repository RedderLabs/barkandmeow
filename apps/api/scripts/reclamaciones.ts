/* Revisión manual de reclamaciones de chip, para el operador del servicio.

   El barrido automático solo traspasa un chip cuando el titular tiene cuenta
   en el portal, porque es la única forma de avisarle. Lo demás pasa por aquí:
   las reclamaciones vencidas contra titulares sin cuenta y las impugnadas.

     pnpm --filter @barkandmeow/api reclamaciones
     pnpm --filter @barkandmeow/api reclamaciones resolver <id> reclamante|titular */
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { clinics, pets, reclamaciones } from "@barkandmeow/db";
import { cerrarDb, db } from "../src/core.js";
import { desestimarReclamacion, traspasarChip } from "../src/routes/mascotas.js";

async function pendientes() {
  return db
    .select({
      id: reclamaciones.id,
      petId: reclamaciones.petId,
      reclamantePetId: reclamaciones.reclamantePetId,
      clinicId: reclamaciones.clinicId,
      estado: reclamaciones.estado,
      plazo: reclamaciones.plazo,
      creada: reclamaciones.createdAt,
      clinica: clinics.name,
      dominio: clinics.domain,
      titularConCuenta: pets.ownerId,
    })
    .from(reclamaciones)
    .innerJoin(pets, eq(pets.id, reclamaciones.petId))
    .innerJoin(clinics, eq(clinics.id, reclamaciones.clinicId))
    .where(
      or(
        eq(reclamaciones.estado, "impugnada"),
        and(eq(reclamaciones.estado, "abierta"), lt(reclamaciones.plazo, new Date()), isNull(pets.ownerId)),
      ),
    )
    .orderBy(reclamaciones.createdAt);
}

async function main() {
  const [orden, id, aFavor] = process.argv.slice(2);

  if (!orden || orden === "lista") {
    const filas = await pendientes();
    if (!filas.length) return console.log("No hay reclamaciones esperando revisión.");
    for (const r of filas)
      console.log(
        [
          r.id,
          r.estado === "impugnada" ? "impugnada" : "vencida, titular sin cuenta",
          `clínica: ${r.clinica} (${r.dominio ?? "sin dominio"})`,
          `abierta: ${r.creada.toISOString().slice(0, 10)}`,
        ].join("  ·  "),
      );
    return;
  }

  if (orden === "resolver" && id && (aFavor === "reclamante" || aFavor === "titular")) {
    const [r] = await db
      .select({
        id: reclamaciones.id,
        petId: reclamaciones.petId,
        reclamantePetId: reclamaciones.reclamantePetId,
        clinicId: reclamaciones.clinicId,
      })
      .from(reclamaciones)
      .where(and(eq(reclamaciones.id, id), inArray(reclamaciones.estado, ["abierta", "impugnada"])))
      .limit(1);
    if (!r) {
      process.exitCode = 1;
      return console.error("No existe o ya está resuelta.");
    }
    const hecho = aFavor === "reclamante" ? await traspasarChip(r) : await desestimarReclamacion(r);
    if (!hecho) process.exitCode = 1;
    return console.log(hecho ? `Resuelta a favor del ${aFavor}.` : "Otra resolución se adelantó.");
  }

  process.exitCode = 1;
  console.error("Uso: reclamaciones [lista] | resolver <id> reclamante|titular");
}

try {
  await main();
} finally {
  await cerrarDb();
}
