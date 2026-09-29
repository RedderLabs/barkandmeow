import { sql } from "drizzle-orm";
import { db } from "./core.js";

/** Plazo para verificar el correo antes de que la cuenta se borre y lo libere. */
export const PLAZO_VERIFICAR = "24 hours";
export const INVITACION_VIGENCIA_MS = 7 * 864e5;

/* Cuentas que nunca verificaron el correo: quien se registra con un correo
   ajeno lo ocupa hasta aquí y no más. Solo se borra lo que no tiene nada
   vivo: dueños con todas sus mascotas pendientes y fuera de reclamaciones,
   clínicas sin ningún miembro verificado ni reclamaciones, e invitaciones sin
   aceptar que caducaron o se retiraron. Idempotente: la llama el cron y
   también cada alta antes de mirar si el correo está libre. */
export async function purgarSinVerificar() {
  return db.transaction(async (tx) => {
    const duenos = await tx.execute(sql`
      WITH viejos AS (
        SELECT o.id FROM owners o
        WHERE o.email_verified_at IS NULL
          AND o.created_at < now() - ${PLAZO_VERIFICAR}::interval
          AND NOT EXISTS (
            SELECT 1 FROM pets p
            WHERE p.owner_id = o.id
              AND (p.estado <> 'pendiente'
                   OR EXISTS (SELECT 1 FROM reclamaciones r WHERE r.reclamante_pet_id = p.id))
          )
      ), sin_mascotas AS (
        DELETE FROM pets WHERE owner_id IN (SELECT id FROM viejos)
      )
      DELETE FROM owners WHERE id IN (SELECT id FROM viejos) RETURNING id`);
    const clinicas = await tx.execute(sql`
      DELETE FROM clinics c
      WHERE c.created_at < now() - ${PLAZO_VERIFICAR}::interval
        AND NOT EXISTS (SELECT 1 FROM clinic_members m WHERE m.clinic_id = c.id AND m.email_verified_at IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM reclamaciones r WHERE r.clinic_id = c.id)
      RETURNING c.id`);
    const invitaciones = await tx.execute(sql`
      DELETE FROM clinic_members
      WHERE accepted_at IS NULL
        AND invite_token_hash IS NOT NULL
        AND (revoked_at IS NOT NULL OR invite_expires_at < now())
      RETURNING id`);
    return { duenos: duenos.length, clinicas: clinicas.length, invitaciones: invitaciones.length };
  });
}
