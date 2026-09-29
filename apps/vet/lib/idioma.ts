"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  IDIOMA_POR_DEFECTO,
  IDIOMAS,
  resolverIdioma,
  t as traducir,
  type Idioma,
} from "@barkandmeow/i18n";

const CLAVE_IDIOMA = "bm.idioma";
const sinSuscripcion = () => () => {};

function idiomaInicial(): Idioma {
  let guardado: string | null = null;
  try {
    guardado = localStorage.getItem(CLAVE_IDIOMA);
  } catch {}
  return (
    IDIOMAS.find((i) => i === guardado) ??
    resolverIdioma(navigator.languages ?? [navigator.language])
  );
}

/* El idioma del navegador es lo primero que ve el veterinario; si lo cambió
   a mano, se respeta en la siguiente visita y en las otras pantallas. En la
   exportación estática el HTML sale en español y el navegador lo corrige al
   hidratar. */
export function useIdioma() {
  const inicial = useSyncExternalStore(sinSuscripcion, idiomaInicial, () => null);
  const [elegido, setElegido] = useState<Idioma | null>(null);
  const idioma = elegido ?? inicial ?? IDIOMA_POR_DEFECTO;

  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);

  function cambiar(nuevo: Idioma) {
    setElegido(nuevo);
    try {
      localStorage.setItem(CLAVE_IDIOMA, nuevo);
    } catch {}
  }

  const t = (clave: string) => traducir(idioma, clave);
  return { idioma, cambiar, t };
}
