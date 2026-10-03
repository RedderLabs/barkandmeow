/* Preferencias de la app en este móvil: tema y tamaño de letra. No van al
   servidor ni dependen de la cuenta: siguen al salir y volver a entrar. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance } from "react-native";
import * as SecureStore from "expo-secure-store";

export type Tema = "sistema" | "claro" | "oscuro";
export type Letra = "normal" | "grande" | "muy-grande";

/** Cuánto crece el texto sobre el tamaño que ya pide el sistema. */
export const ESCALA: Record<Letra, number> = {
  normal: 1,
  grande: 1.15,
  "muy-grande": 1.3,
};

const TEMA = "bm.tema";
const LETRA = "bm.letra";

const esTema = (v: string | null): v is Tema => v === "sistema" || v === "claro" || v === "oscuro";
const esLetra = (v: string | null): v is Letra => v === "normal" || v === "grande" || v === "muy-grande";

const aplicarTema = (t: Tema) =>
  Appearance.setColorScheme(t === "claro" ? "light" : t === "oscuro" ? "dark" : "unspecified");

type Ajustes = {
  tema: Tema;
  letra: Letra;
  elegirTema(t: Tema): void;
  elegirLetra(l: Letra): void;
};

const Contexto = createContext<Ajustes | null>(null);

export function ProveedorAjustes({ children }: { children: ReactNode }) {
  const [listo, setListo] = useState(false);
  const [tema, setTema] = useState<Tema>("sistema");
  const [letra, setLetra] = useState<Letra>("normal");

  useEffect(() => {
    void (async () => {
      const [t, l] = await Promise.all([
        SecureStore.getItemAsync(TEMA).catch(() => null),
        SecureStore.getItemAsync(LETRA).catch(() => null),
      ]);
      if (esTema(t)) {
        setTema(t);
        aplicarTema(t);
      }
      if (esLetra(l)) setLetra(l);
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

  const valor = useMemo(() => ({ tema, letra, elegirTema, elegirLetra }), [tema, letra, elegirTema, elegirLetra]);
  // Hasta leerlas no se pinta nada: así no hay un parpadeo del tema o del tamaño equivocado.
  if (!listo) return null;
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAjustes(): Ajustes {
  const a = useContext(Contexto);
  if (!a) throw new Error("useAjustes fuera de ProveedorAjustes");
  return a;
}

/** El factor del tamaño de letra elegido (1 fuera del proveedor, p. ej. en tests). */
export function useEscala(): number {
  const a = useContext(Contexto);
  return a ? ESCALA[a.letra] : 1;
}
