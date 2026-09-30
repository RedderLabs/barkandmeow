"use client";

import { useEffect } from "react";
import { cargarCripto, claveDeRecuperacion, deBase64 } from "@barkandmeow/crypto";
import { guardarClaveRecuperacion } from "@/lib/api";
import { leerClave } from "@/lib/claves";
import { CRYPTO_WASM_URL } from "@/lib/crypto-url";

const b64 = (b: Uint8Array) => {
  let x = "";
  for (const c of b) x += String.fromCharCode(c);
  return btoa(x);
};

const iguales = (x: Uint8Array, y: Uint8Array | null) => !!y && x.length === y.length && x.every((v, i) => v === y[i]);

/* Cuentas de antes de la recuperación de contraseña: si este navegador ya
   guarda la clave del papel, sube una vez la pública de recuperación. Sin
   interfaz; si falla, se intenta en la próxima visita. */
export function RellenoRecuperacion({ pubKey, pendiente }: { pubKey: string; pendiente: boolean }) {
  useEffect(() => {
    if (!pendiente) return;
    void (async () => {
      const local = await leerClave();
      if (!local) return;
      const cripto = await cargarCripto(fetch(CRYPTO_WASM_URL));
      // Solo si la clave guardada es la de esta cuenta.
      if (!iguales(cripto.publica(local.secreta), deBase64(pubKey))) return;
      await guardarClaveRecuperacion(b64(claveDeRecuperacion(cripto, local.secreta).publica));
    })().catch(() => {});
  }, [pubKey, pendiente]);
  return null;
}
