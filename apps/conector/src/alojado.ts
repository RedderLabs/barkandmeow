import { existsSync } from "node:fs";

/* MODO_ALOJADO: el conector corriendo en servidores de Bark & Meow en nombre
   de la clínica, en vez de en la propia clínica.

   Está apagado y así debe seguir salvo decisión expresa. Alojado, Bark &
   Meow tendría a la vez las credenciales del programa de gestión (lee las
   fichas en claro) y la clave de firma de la clínica (firma en su nombre):
   el cifrado de extremo a extremo dejaría de serlo, porque el operador del
   servicio podría leer y firmar lo que quisiera. Por eso exige:

   1. MODO_ALOJADO=si
   2. MODO_ALOJADO_ROMPE_E2E=entendido
   3. CONSENTIMIENTO_ALOJADO: ruta al consentimiento firmado por la clínica
      (PDF), que tiene que existir.

   Sin las tres, el conector no arranca. Con ellas, avisa en cada vuelta. */

export type Alojamiento = { alojado: false } | { alojado: true; consentimiento: string };

export function comprobarAlojado(env: NodeJS.ProcessEnv = process.env): Alojamiento {
  const modo = (env.MODO_ALOJADO ?? "").trim().toLowerCase();
  if (!modo || ["0", "no", "off", "false"].includes(modo)) return { alojado: false };

  const faltan: string[] = [];
  if (!["si", "sí", "1", "true", "on"].includes(modo)) faltan.push("MODO_ALOJADO=si");
  if (env.MODO_ALOJADO_ROMPE_E2E !== "entendido") faltan.push("MODO_ALOJADO_ROMPE_E2E=entendido");
  const doc = env.CONSENTIMIENTO_ALOJADO;
  if (!doc || !existsSync(doc)) faltan.push("CONSENTIMIENTO_ALOJADO con la ruta al consentimiento firmado por la clínica");
  if (faltan.length)
    throw new Error(
      [
        "MODO_ALOJADO está pedido pero no autorizado.",
        "Alojado en Bark & Meow, el conector lee las fichas en claro y firma en nombre de la clínica:",
        "rompe el cifrado de extremo a extremo y exige el consentimiento escrito de la clínica.",
        `Falta: ${faltan.join("; ")}.`,
        "Para el uso normal, quita MODO_ALOJADO y ejecuta el conector en la clínica.",
      ].join("\n"),
    );
  return { alojado: true, consentimiento: doc! };
}
