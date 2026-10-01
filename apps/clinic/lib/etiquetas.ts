"use client";

import { useEffect, useMemo, useState } from "react";
import {
  aBase64,
  abrirEtiqueta,
  cerrarEtiqueta,
  claveEtiquetas,
  deBase64,
  type Cripto,
} from "@barkandmeow/crypto";
import { leerClaves } from "@/lib/claves";
import { CLAVE_LISTA, cripto, igual } from "@/lib/cripto";

/* Las etiquetas de los pacientes se abren y se cierran aquí, en el navegador,
   con una clave que sale de la clave de la clínica. Un navegador que no la
   tiene ve que hay etiqueta, pero no lo que dice. */

export type Etiquetas = {
  /** `sin-clave`: este navegador no tiene la clave de la clínica. */
  estado: "mirando" | "con-clave" | "sin-clave";
  /** El texto de una etiqueta, o null si no hay o no se puede abrir. */
  abrir(petId: string, sellada: string | null): string | null;
  /** La etiqueta cifrada, en base64, lista para enviar. */
  cerrar(petId: string, texto: string): string;
};

export function useEtiquetas(clinicId: string, pubKeyClinica: string): Etiquetas {
  const [llave, setLlave] = useState<{ c: Cripto; clave: Uint8Array } | "mirando" | null>("mirando");

  useEffect(() => {
    let vivo = true;
    const mirar = async () => {
      try {
        const c = await cripto();
        const local = await leerClaves(clinicId).catch(() => null);
        const publica = deBase64(pubKeyClinica);
        // Una clave que no corresponde a esta clínica no sirve para nada.
        const vale = !!local?.clinica && igual(c.publica(local.clinica), publica);
        if (vivo) setLlave(vale ? { c, clave: claveEtiquetas(c, local.clinica!) } : null);
      } catch {
        if (vivo) setLlave(null);
      }
    };
    void mirar();
    window.addEventListener(CLAVE_LISTA, mirar);
    return () => {
      vivo = false;
      window.removeEventListener(CLAVE_LISTA, mirar);
    };
  }, [clinicId, pubKeyClinica]);

  return useMemo<Etiquetas>(() => {
    if (llave === "mirando" || !llave)
      return {
        estado: llave === "mirando" ? "mirando" : "sin-clave",
        abrir: () => null,
        cerrar: () => {
          throw new Error("este navegador no tiene la clave de la clínica");
        },
      };
    const { c, clave } = llave;
    return {
      estado: "con-clave",
      abrir(petId, sellada) {
        const sobre = sellada ? deBase64(sellada) : null;
        return sobre ? abrirEtiqueta(c, clave, clinicId, petId, sobre) : null;
      },
      cerrar: (petId, texto) => aBase64(cerrarEtiqueta(c, clave, clinicId, petId, texto)),
    };
  }, [llave, clinicId]);
}
