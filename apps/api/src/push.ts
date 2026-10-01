import { eq, inArray } from "drizzle-orm";
import { ownerDevices, pets } from "@barkandmeow/db";
import { db } from "./core.js";

/* ── Avisos push al móvil del dueño ───────────────────────────
   Decidido 2026-09-30: la app es Expo, así que el servidor habla con el
   servicio push de Expo, que entrega por APNs y FCM con las credenciales que
   se suben a EAS. Aquí no vive ninguna clave de Apple ni de Google;
   EXPO_ACCESS_TOKEN es opcional (solo si el proyecto exige envíos con token).

   El aviso no lleva contenido, ni siquiera el nombre de la mascota: pasa por
   Expo, Apple y Google. Dice que hay algo nuevo y la app abre la bandeja,
   donde el mensaje se descifra en el móvil. PUSH=off lo desactiva. Un fallo
   del push nunca tumba la petición que lo provoca. */

export type AvisoPush = { tipo: "bandeja" | "reclamacion" | "permiso"; petId: string };
type Mensaje = { to: string; title: string; body: string; data: AvisoPush; sound: "default"; priority: "high" };
export type Pushero = (m: Mensaje[]) => Promise<{ token: string; caducado: boolean }[]>;

const TEXTO: Record<AvisoPush["tipo"], string> = {
  bandeja: "Tienes un mensaje nuevo en Bark & Meow.",
  reclamacion: "Hay una reclamación sobre el chip de tu mascota. Ábrela para responder.",
  // Sin el nombre de la clínica: el aviso pasa por Expo, Apple y Google.
  permiso: "Una clínica pide acceso a la ficha de tu mascota. Tienes diez minutos para responder.",
};

let pushero: Pushero = async (mensajes) => {
  const r = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(mensajes),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Expo push respondió ${r.status}`);
  const { data } = (await r.json()) as { data: { status: string; details?: { error?: string } }[] };
  return mensajes.map((m, i) => ({
    token: m.to,
    caducado: data[i]?.status === "error" && data[i]?.details?.error === "DeviceNotRegistered",
  }));
};

export function usarPushero(p: Pushero) {
  pushero = p;
}

/** Avisa a los móviles del dueño de una mascota. Nunca lanza. */
export async function avisarPush(
  aviso: AvisoPush,
  log?: { warn: (o: object, m: string) => void },
): Promise<void> {
  if (process.env.PUSH === "off") return;
  try {
    const moviles = await db
      .select({ token: ownerDevices.token })
      .from(pets)
      .innerJoin(ownerDevices, eq(ownerDevices.ownerId, pets.ownerId))
      .where(eq(pets.id, aviso.petId));
    if (!moviles.length) return;
    const res = await pushero(
      moviles.map((m) => ({
        to: m.token,
        title: "Bark & Meow",
        body: TEXTO[aviso.tipo],
        data: aviso,
        sound: "default",
        priority: "high",
      })),
    );
    const caducados = res.filter((x) => x.caducado).map((x) => x.token);
    // La app se desinstaló o retiró el permiso: el token ya no sirve.
    if (caducados.length) await db.delete(ownerDevices).where(inArray(ownerDevices.token, caducados));
    const vivos = res.filter((x) => !x.caducado).map((x) => x.token);
    if (vivos.length) await db.update(ownerDevices).set({ ultimoUso: new Date() }).where(inArray(ownerDevices.token, vivos));
  } catch (e) {
    log?.warn({ err: (e as Error).message }, "no se pudo enviar el aviso push");
  }
}
