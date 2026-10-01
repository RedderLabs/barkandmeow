"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cargarCripto, deBase64, type Cripto } from "@barkandmeow/crypto";
import { leerClave } from "@/lib/claves";
import { CRYPTO_WASM_URL } from "@/lib/crypto-url";

/* El núcleo se carga una vez por pestaña, la primera vez que alguien lo pide. */
let nucleo: Promise<Cripto> | null = null;
export const cripto = () => (nucleo ??= cargarCripto(fetch(CRYPTO_WASM_URL)));

export const igual = (a: Uint8Array | null, b: Uint8Array | null) =>
  !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

export type Llave = { c: Cripto; secreta: Uint8Array };

export type EstadoClave = { tipo: "mirando" } | { tipo: "falta" } | ({ tipo: "lista" } & Llave);

/**
 * La clave del dueño en este navegador. `falta`: hay que reconstruirla con el
 * código en papel (componente Recuperar), que llama a `alRecuperar`.
 */
export function useClave(pubKey: string) {
  const [estado, setEstado] = useState<EstadoClave>({ tipo: "mirando" });
  const publica = useMemo(() => deBase64(pubKey), [pubKey]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const [c, local] = await Promise.all([cripto(), leerClave()]);
        if (!vivo) return;
        // Una clave que no es la de esta cuenta no abre nada: mejor pedir el papel.
        if (local && igual(c.publica(local.secreta), publica)) setEstado({ tipo: "lista", c, secreta: local.secreta });
        else setEstado({ tipo: "falta" });
      } catch {
        if (vivo) setEstado({ tipo: "falta" });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [publica]);

  const alRecuperar = useCallback(async (secreta: Uint8Array) => {
    setEstado({ tipo: "lista", c: await cripto(), secreta });
  }, []);

  return { estado, publica, alRecuperar };
}
