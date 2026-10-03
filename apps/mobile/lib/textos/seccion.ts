/* Cómo se escribe un grupo de textos de la app: el español es la fuente y
   fija las claves; el tipo obliga a que pt, en y fr tengan exactamente las
   mismas. Los huecos van entre llaves, {nombre}, y los rellena fmt(). */

import type { Idioma } from "@barkandmeow/i18n";

export type Textos<K extends string> = Record<Idioma, Record<K, string>>;

export const seccion = <const T extends Record<string, string>>(
  es: T,
  otros: Record<Exclude<Idioma, "es">, { [K in keyof T]: string }>,
): Textos<Extract<keyof T, string>> => ({ es, ...otros });
