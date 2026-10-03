/* Preferencias de la app en este móvil: tema, tamaño de letra e idioma. No
   van al servidor ni dependen de la cuenta: siguen al salir y volver a entrar. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance } from "react-native";
import * as SecureStore from "expo-secure-store";
import { IDIOMAS, resolverIdioma, type Idioma } from "@barkandmeow/i18n";

export type Tema = "sistema" | "claro" | "oscuro";
export type Letra = "normal" | "grande" | "muy-grande";
/** «sistema»: el del teléfono si es uno de los cuatro; si no, español. */
export type PreferenciaIdioma = "sistema" | Idioma;

/** Cuánto crece el texto sobre el tamaño que ya pide el sistema. */
export const ESCALA: Record<Letra, number> = {
  normal: 1,
  grande: 1.15,
  "muy-grande": 1.3,
};

const TEMA = "bm.tema";
const LETRA = "bm.letra";
/** Dónde se guarda el idioma elegido; lib/push.ts lo lee fuera de React. */
export const IDIOMA = "bm.idioma";

const esTema = (v: string | null): v is Tema => v === "sistema" || v === "claro" || v === "oscuro";
const esLetra = (v: string | null): v is Letra => v === "normal" || v === "grande" || v === "muy-grande";
const esIdioma = (v: string | null): v is PreferenciaIdioma => v === "sistema" || IDIOMAS.some((i) => i === v);

/** El idioma del teléfono. Hermes trae Intl, así que no hace falta un módulo nativo. */
export function idiomaDelSistema(): Idioma {
  try {
    return resolverIdioma([Intl.DateTimeFormat().resolvedOptions().locale]);
  } catch {
    return resolverIdioma([]);
  }
}

const aplicarTema = (t: Tema) =>
  Appearance.setColorScheme(t === "claro" ? "light" : t === "oscuro" ? "dark" : "unspecified");

type Ajustes = {
  tema: Tema;
  letra: Letra;
  idioma: PreferenciaIdioma;
  /** El que se usa de verdad: el elegido o, con «sistema», el del teléfono. */
  idiomaActual: Idioma;
  elegirTema(t: Tema): void;
  elegirLetra(l: Letra): void;
  elegirIdioma(i: PreferenciaIdioma): void;
};

const Contexto = createContext<Ajustes | null>(null);

export function ProveedorAjustes({ children }: { children: ReactNode }) {
  const [listo, setListo] = useState(false);
  const [tema, setTema] = useState<Tema>("sistema");
  const [letra, setLetra] = useState<Letra>("normal");
  const [idioma, setIdioma] = useState<PreferenciaIdioma>("sistema");

  useEffect(() => {
    void (async () => {
      const [t, l, i] = await Promise.all([
        SecureStore.getItemAsync(TEMA).catch(() => null),
        SecureStore.getItemAsync(LETRA).catch(() => null),
        SecureStore.getItemAsync(IDIOMA).catch(() => null),
      ]);
      if (esTema(t)) {
        setTema(t);
        aplicarTema(t);
      }
      if (esLetra(l)) setLetra(l);
      if (esIdioma(i)) setIdioma(i);
      setListo(true);
    })();
  }, []);

  const elegirTema = useCallback((t: Tema) => {
    setTema(t);
    aplicarTema(t);
    void SecureStore.setItemAsync(TEMA, t).catch(() => {});
  }, []);

  const elegirLetra = useCallback((l: Letra) => {
    setLetra(l);
    void SecureStore.setItemAsync(LETRA, l).catch(() => {});
  }, []);

  const elegirIdioma = useCallback((i: PreferenciaIdioma) => {
    setIdioma(i);
    void SecureStore.setItemAsync(IDIOMA, i).catch(() => {});
  }, []);

  const idiomaActual = idioma === "sistema" ? idiomaDelSistema() : idioma;
  const valor = useMemo(
    () => ({ tema, letra, idioma, idiomaActual, elegirTema, elegirLetra, elegirIdioma }),
    [tema, letra, idioma, idiomaActual, elegirTema, elegirLetra, elegirIdioma],
  );
  // Hasta leerlas no se pinta nada: así no hay un parpadeo del tema o del tamaño equivocado.
  if (!listo) return null;
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAjustes(): Ajustes {
  const a = useContext(Contexto);
  if (!a) throw new Error("useAjustes fuera de ProveedorAjustes");
  return a;
}

/** El idioma en uso (el del sistema fuera del proveedor, p. ej. en tests). */
export function useIdioma(): Idioma {
  const a = useContext(Contexto);
  return a ? a.idiomaActual : idiomaDelSistema();
}

/** El factor del tamaño de letra elegido (1 fuera del proveedor, p. ej. en tests). */
export function useEscala(): number {
  const a = useContext(Contexto);
  return a ? ESCALA[a.letra] : 1;
}
