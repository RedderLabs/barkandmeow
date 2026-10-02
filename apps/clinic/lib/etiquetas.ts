"use client";

import { useEffect, useMemo, useState } from "react";
import {
  aBase64,
  abrirClaveDeEquipo,
  abrirEtiqueta,
  cerrarClaveParaEquipo,
  cerrarEtiqueta,
  claveEtiquetas,
  deBase64,
  entregarClaveEtiquetas,
  recibirClaveEtiquetas,
  type Cripto,
} from "@barkandmeow/crypto";
import { clavesPendientes, entregarClaves, entregarFichas, fichasPendientes, presentarDispositivo } from "@/lib/api";
import { guardarClaves, leerClaves } from "@/lib/claves";
import { CLAVE_LISTA, cripto, igual } from "@/lib/cripto";

/* Las etiquetas de los pacientes se abren y se cierran aquí, en el navegador.

   La clave con que se cifran sale de la clave de la clínica, que solo tienen
   los administradores. El resto del equipo la recibe de ellos: cada navegador
   se presenta con su clave pública y, la próxima vez que un administrador abre
   la consola, su navegador le deja la clave de las etiquetas cifrada para él.
   No hay que pulsar nada. Hasta entonces el navegador ve que hay nombre, pero
   no lo que dice. */

export type Etiquetas = {
  /** `esperando`: este navegador aún no ha recibido la clave de un administrador. */
  estado: "mirando" | "con-clave" | "esperando";
  /** El texto de una etiqueta, o null si no hay o no se puede abrir. */
  abrir(petId: string, sellada: string | null): string | null;
  /** La etiqueta cifrada, en base64, lista para enviar. */
  cerrar(petId: string, texto: string): string;
  /** La clave de una ficha que un administrador cerró para el equipo, o null. */
  claveFicha(petId: string, cerrada: string | null): Uint8Array | null;
};

/** Cada cuánto vuelve a preguntar un navegador que espera, y a repartir uno que tiene la clave. */
const VUELTA_MS = 20_000;

type Llave = { c: Cripto; clave: Uint8Array; secretaClinica: Uint8Array | null };

/** Con la clave de la clínica en la mano, deja la de las etiquetas a los navegadores que esperan. */
async function repartir(c: Cripto, secretaClinica: Uint8Array) {
  const { dispositivos } = await clavesPendientes();
  const entregas = dispositivos.flatMap((d) => {
    const publica = deBase64(d.devicePubKey);
    return publica?.length === 32
      ? [{ dispositivoId: d.id, sellada: aBase64(entregarClaveEtiquetas(c, secretaClinica, publica)) }]
      : [];
  });
  if (entregas.length) await entregarClaves(entregas);
}

/** Y cierra para el equipo la clave de cada ficha que el dueño selló para la clínica. */
async function repartirFichas(c: Cripto, secretaClinica: Uint8Array, clinicId: string) {
  const { permisos } = await fichasPendientes();
  const clave = claveEtiquetas(c, secretaClinica);
  const entregas = permisos.flatMap((p) => {
    const sellada = deBase64(p.claveEnvuelta);
    if (!sellada) return [];
    try {
      const k = c.abrirSellado(secretaClinica, sellada);
      return [{ permisoId: p.id, cerrada: aBase64(cerrarClaveParaEquipo(c, clave, clinicId, p.petId, k)) }];
    } catch {
      // Sellada para otra clave: ese permiso no se abre aquí.
      return [];
    }
  });
  if (entregas.length) await entregarFichas(entregas);
}

export function useEtiquetas(clinicId: string, pubKeyClinica: string, esAdmin: boolean): Etiquetas {
  const [llave, setLlave] = useState<Llave | "mirando" | null>("mirando");

  useEffect(() => {
    let vivo = true;
    let reloj: ReturnType<typeof setTimeout> | undefined;

    const mirar = async () => {
      clearTimeout(reloj);
      let encontrada: Llave | null = null;
      try {
        const c = await cripto();
        const publica = deBase64(pubKeyClinica);
        if (!publica) throw new Error("clave pública de la clínica inválida");
        let local = await leerClaves(clinicId).catch(() => null);

        if (local?.clinica && igual(c.publica(local.clinica), publica)) {
          // Administrador con la clave de la clínica: la de las etiquetas sale de ella.
          encontrada = { c, clave: claveEtiquetas(c, local.clinica), secretaClinica: local.clinica };
        } else {
          // El resto: este navegador se presenta y recoge la clave si ya se la dejaron.
          if (!local) {
            local = {
              clinicId,
              clinica: null,
              dispositivo: crypto.getRandomValues(new Uint8Array(32)),
              guardada: new Date().toISOString(),
            };
            await guardarClaves(local);
          }
          const r = await presentarDispositivo(aBase64(c.publica(local.dispositivo)));
          const sellada = r.claveEtiquetas ? deBase64(r.claveEtiquetas) : null;
          const clave = sellada ? recibirClaveEtiquetas(c, local.dispositivo, publica, sellada) : null;
          if (clave) encontrada = { c, clave, secretaClinica: null };
        }
      } catch {
        // Sin red o sin almacén: se queda esperando y lo reintenta.
      }
      if (!vivo) return;
      setLlave(encontrada);

      if (encontrada?.secretaClinica && esAdmin) {
        await repartir(encontrada.c, encontrada.secretaClinica).catch(() => undefined);
        await repartirFichas(encontrada.c, encontrada.secretaClinica, clinicId).catch(() => undefined);
      }
      // Quien espera vuelve a preguntar; quien reparte vuelve a mirar si alguien se ha presentado.
      if (vivo && (!encontrada || (encontrada.secretaClinica && esAdmin))) reloj = setTimeout(mirar, VUELTA_MS);
    };

    void mirar();
    window.addEventListener(CLAVE_LISTA, mirar);
    return () => {
      vivo = false;
      clearTimeout(reloj);
      window.removeEventListener(CLAVE_LISTA, mirar);
    };
  }, [clinicId, pubKeyClinica, esAdmin]);

  return useMemo<Etiquetas>(() => {
    if (llave === "mirando" || !llave)
      return {
        estado: llave === "mirando" ? "mirando" : "esperando",
        abrir: () => null,
        cerrar: () => {
          throw new Error("este navegador aún no tiene la clave de los nombres");
        },
        claveFicha: () => null,
      };
    const { c, clave } = llave;
    return {
      estado: "con-clave",
      abrir(petId, sellada) {
        const sobre = sellada ? deBase64(sellada) : null;
        return sobre ? abrirEtiqueta(c, clave, clinicId, petId, sobre) : null;
      },
      cerrar: (petId, texto) => aBase64(cerrarEtiqueta(c, clave, clinicId, petId, texto)),
      claveFicha(petId, cerrada) {
        const sobre = cerrada ? deBase64(cerrada) : null;
        return sobre ? abrirClaveDeEquipo(c, clave, clinicId, petId, sobre) : null;
      },
    };
  }, [llave, clinicId]);
}
