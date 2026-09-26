import { z } from "zod";

/* Un animal se identifica con una LISTA de identificadores, no con un campo.
   El microchip ISO solo es obligatorio en la Parte A del Reglamento (UE) 576/2013
   (perro, gato, hurón). Un ave lleva anilla, un reptil puede no llevar nada. */

export const tipoIdentificador = z.enum([
  "iso",
  "nonISO",
  "ring",
  "tattoo",
]);
export type TipoIdentificador = z.infer<typeof tipoIdentificador>;

/** 15 dígitos, sin espacios. Los tres primeros son país o fabricante. */
export const ISO_RE = /^\d{15}$/;
/** 9 o 10 caracteres alfanuméricos en mayúsculas, con prefijo explícito. */
export const NON_ISO_RE = /^nonISO:[0-9A-F]{9,10}$/;

export const identificador = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("iso"), valor: z.string().regex(ISO_RE) }),
  z.object({ tipo: z.literal("nonISO"), valor: z.string().regex(NON_ISO_RE) }),
  z.object({ tipo: z.literal("ring"), valor: z.string().min(3).max(32) }),
  z.object({
    tipo: z.literal("tattoo"),
    valor: z.string().min(3).max(32),
    ubicacion: z.string().max(64).optional(),
  }),
]);
export type Identificador = z.infer<typeof identificador>;

/** Códigos ISO 3166 numéricos que aparecen como prefijo de chip. Ampliable. */
const PAISES: Record<string, string> = {
  "040": "AT", "056": "BE", "100": "BG", "191": "HR", "196": "CY",
  "203": "CZ", "208": "DK", "233": "EE", "246": "FI", "250": "FR",
  "276": "DE", "300": "GR", "348": "HU", "372": "IE", "380": "IT",
  "428": "LV", "440": "LT", "442": "LU", "470": "MT", "528": "NL",
  "578": "NO", "616": "PL", "620": "PT", "642": "RO", "703": "SK",
  "705": "SI", "724": "ES", "752": "SE", "756": "CH", "826": "GB",
};

export type OrigenChip =
  | { clase: "pais"; codigo: string; iso2: string }
  | { clase: "fabricante"; codigo: string; compartido: boolean }
  | { clase: "desconocido"; codigo: string };

/**
 * Resuelve los tres primeros dígitos de un chip ISO sin llamar a nadie.
 * ICAR asigna 900–998 a fabricantes; el 900 es un código compartido de entrada,
 * así que no identifica a ninguno en concreto. Por debajo de 900 es país.
 */
export function origenChip(valor: string): OrigenChip {
  const codigo = valor.slice(0, 3);
  const n = Number(codigo);
  if (!ISO_RE.test(valor) || Number.isNaN(n)) return { clase: "desconocido", codigo };
  if (n >= 900 && n <= 998) {
    return { clase: "fabricante", codigo, compartido: n === 900 };
  }
  const iso2 = PAISES[codigo];
  return iso2
    ? { clase: "pais", codigo, iso2 }
    : { clase: "desconocido", codigo };
}

/** Quita espacios y puntos para poder comparar y guardar siempre igual. */
export function normalizarChip(entrada: string): string {
  const limpio = entrada.trim().replace(/[\s.-]/g, "");
  if (/^nonISO:/i.test(limpio)) {
    return "nonISO:" + limpio.slice(7).toUpperCase();
  }
  return limpio;
}
