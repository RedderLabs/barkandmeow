/* Traducir en la app: `const t = useT();` y luego `t("cuenta.titulo")` o
   `t("bandeja.borrarVarios", { n: 3 })`. Las funciones puras que no son
   componentes reciben `t` como parámetro. */

import { useCallback } from "react";
import { fmt } from "@barkandmeow/i18n";
import { useIdioma } from "./ajustes";
import { TEXTOS, type Clave } from "./textos";

export type { Clave };
export type T = (clave: Clave, valores?: Record<string, string | number>) => string;

export function useT(): T {
  const idioma = useIdioma();
  return useCallback(
    (clave, valores) => {
      const s = TEXTOS[idioma][clave] ?? TEXTOS.es[clave] ?? clave;
      return valores ? fmt(s, valores) : s;
    },
    [idioma],
  );
}
